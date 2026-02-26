import { DbClient, query } from "../db.js";

export type NominationWithDisplay = {
  id: number;
  category_edition_id: number;
  sort_order?: number;
  unit_kind?: string;
  film_id: number | null;
  song_id: number | null;
  performance_id: number | null;
  // The film "shown" for the nomination, regardless of whether the subject is a film, song-in-film, or performance-in-film.
  display_film_id?: number | null;
  display_film_tmdb_id?: number | null;
  film_title: string | null;
  film_poster_url?: string | null;
  film_year?: number | null;
  song_title: string | null;
  performer_name: string | null;
  performer_profile_url?: string | null;
  performer_profile_path?: string | null;
  performer_character?: string | null;
  contributors?: Array<{
    nomination_contributor_id?: number;
    person_id: number;
    full_name: string;
    tmdb_id?: number | null;
    role_label: string | null;
    sort_order: number;
  }>;
  status?: "ACTIVE" | "REVOKED" | "REPLACED";
  replaced_by_nomination_id?: number | null;
};

export async function listNominationsForCeremony(
  client: DbClient,
  ceremonyId: number
): Promise<NominationWithDisplay[]> {
  const { rows } = await query<NominationWithDisplay>(
    client,
    `SELECT
       n.id::int,
       n.category_edition_id::int,
       n.sort_order::int,
       ce.unit_kind,
       n.film_id::int,
       n.song_id::int,
       n.performance_id::int,
       COALESCE(f.id, sf.id, pf.id)::int AS display_film_id,
       COALESCE(f.tmdb_id, sf.tmdb_id, pf.tmdb_id)::int AS display_film_tmdb_id,
       n.status,
       n.replaced_by_nomination_id::int,
       COALESCE(f.title, sf.title, pf.title) AS film_title,
       COALESCE(f.poster_url, sf.poster_url, pf.poster_url) AS film_poster_url,
       COALESCE(f.release_year, sf.release_year, pf.release_year) AS film_year,
       s.title AS song_title,
       primary_person.full_name AS performer_name,
       primary_person.profile_url AS performer_profile_url,
       primary_person.profile_path AS performer_profile_path,
       primary_person.role_label AS performer_character,
       COALESCE(
         json_agg(
           json_build_object(
             'nomination_contributor_id', nc.id::int,
             'person_id', p2.id::int,
             'full_name', p2.full_name,
             'tmdb_id', p2.tmdb_id::int,
             'role_label', nc.role_label,
             'sort_order', nc.sort_order::int
           )
           ORDER BY nc.sort_order ASC, nc.id ASC
         ) FILTER (WHERE nc.id IS NOT NULL),
         '[]'::json
       ) AS contributors
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     LEFT JOIN film f0 ON f0.id = n.film_id
     LEFT JOIN film f ON f.id = COALESCE(f0.consolidated_into_film_id, f0.id)
     LEFT JOIN song s ON s.id = n.song_id
     LEFT JOIN film sf0 ON sf0.id = s.film_id
     LEFT JOIN film sf ON sf.id = COALESCE(sf0.consolidated_into_film_id, sf0.id)
     LEFT JOIN performance perf ON perf.id = n.performance_id
     LEFT JOIN film pf0 ON pf0.id = perf.film_id
     LEFT JOIN film pf ON pf.id = COALESCE(pf0.consolidated_into_film_id, pf0.id)
     LEFT JOIN LATERAL (
       SELECT p.full_name, p.profile_url, p.profile_path, nc.role_label
       FROM nomination_contributor nc
       JOIN person p ON p.id = nc.person_id
       WHERE nc.nomination_id = n.id
       ORDER BY nc.sort_order ASC, nc.id ASC
       LIMIT 1
     ) primary_person ON TRUE
     LEFT JOIN nomination_contributor nc ON nc.nomination_id = n.id
     LEFT JOIN person p2 ON p2.id = nc.person_id
     WHERE ce.ceremony_id = $1
     GROUP BY
       n.id,
       n.category_edition_id,
       n.sort_order,
       ce.unit_kind,
       n.film_id,
       n.song_id,
       n.performance_id,
       f.id,
       sf.id,
       pf.id,
       f.tmdb_id,
       sf.tmdb_id,
       pf.tmdb_id,
       n.status,
       n.replaced_by_nomination_id,
        f.title,
        f.poster_url,
       f.release_year,
        sf.title,
        sf.poster_url,
       sf.release_year,
        pf.title,
        pf.poster_url,
       pf.release_year,
        s.title,
        primary_person.full_name,
        primary_person.profile_url,
        primary_person.profile_path,
        primary_person.role_label
     ORDER BY n.category_edition_id, n.sort_order ASC, n.id ASC`,
    [ceremonyId]
  );

  // Best-effort: infer missing cast roles from stored film TMDB credits.
  const perfRows = rows.filter(
    (r) => String(r.unit_kind ?? "").toUpperCase() === "PERFORMANCE" && r.display_film_id
  );
  const filmIds = Array.from(
    new Set(perfRows.map((r) => Number(r.display_film_id)).filter(Boolean))
  );
  if (filmIds.length === 0) return rows;

  const creditsByFilmId = new Map<number, unknown>();
  const creditsRes = await query<{ id: number; tmdb_credits: unknown }>(
    client,
    `SELECT id::int, tmdb_credits FROM film WHERE id = ANY($1::int[])`,
    [filmIds]
  );
  for (const r of creditsRes.rows) creditsByFilmId.set(Number(r.id), r.tmdb_credits);

  for (const row of perfRows) {
    const credits = creditsByFilmId.get(Number(row.display_film_id)) as
      | {
          cast?: Array<{
            id?: number;
            tmdb_id?: number;
            character?: string | null;
            profile_path?: string | null;
          }>;
        }
      | null
      | undefined;
    const cast = Array.isArray(credits?.cast) ? credits!.cast! : [];
    const contributors = Array.isArray(row.contributors) ? row.contributors : [];

    let primaryCharacter: string | null = row.performer_character ?? null;
    let primaryProfilePath: string | null = row.performer_profile_path ?? null;
    for (const c of contributors) {
      if (c.role_label) continue;
      const tmdbId = typeof c.tmdb_id === "number" ? c.tmdb_id : null;
      if (!tmdbId) continue;
      const match = cast.find((p) => Number(p?.tmdb_id ?? p?.id) === Number(tmdbId));
      const character =
        typeof match?.character === "string" ? match.character.trim() : "";
      if (!character) continue;
      c.role_label = character;
      if (!primaryCharacter) primaryCharacter = character;
      if (!primaryProfilePath && typeof match?.profile_path === "string") {
        primaryProfilePath = match.profile_path;
      }
    }

    if (!row.performer_character && primaryCharacter) {
      row.performer_character = primaryCharacter;
    }
    if (!row.performer_profile_path && !row.performer_profile_url && primaryProfilePath) {
      row.performer_profile_path = primaryProfilePath;
    }
  }

  return rows;
}

export async function updateNominationStatus(
  client: DbClient,
  input: {
    nomination_id: number;
    status: "ACTIVE" | "REVOKED" | "REPLACED";
    replaced_by_nomination_id?: number | null;
  }
): Promise<void> {
  await query(
    client,
    `UPDATE nomination
     SET status = $2,
         replaced_by_nomination_id = $3
     WHERE id = $1`,
    [input.nomination_id, input.status, input.replaced_by_nomination_id ?? null]
  );
}

export async function getNominationWithStatus(
  client: DbClient,
  nominationId: number
): Promise<NominationWithDisplay | null> {
  const { rows } = await query<NominationWithDisplay>(
    client,
    `SELECT
       n.id::int,
       n.category_edition_id::int,
       n.film_id::int,
       n.song_id::int,
       n.performance_id::int,
       n.status,
       n.replaced_by_nomination_id::int,
       NULL::text AS film_title,
       NULL::text AS song_title,
       NULL::text AS performer_name
     FROM nomination n
     WHERE n.id = $1`,
    [nominationId]
  );
  return rows[0] ?? null;
}

export async function insertNominationChangeAudit(
  client: DbClient,
  input: {
    nomination_id: number;
    replacement_nomination_id?: number | null;
    origin: "INTERNAL" | "EXTERNAL";
    impact: "CONSEQUENTIAL" | "BENIGN";
    action: "REVOKE" | "REPLACE" | "RESTORE";
    reason: string;
    created_by_user_id: number;
  }
): Promise<void> {
  await query(
    client,
    `INSERT INTO nomination_change_audit
     (nomination_id, replacement_nomination_id, origin, impact, action, reason, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.nomination_id,
      input.replacement_nomination_id ?? null,
      input.origin,
      input.impact,
      input.action,
      input.reason,
      input.created_by_user_id
    ]
  );
}
