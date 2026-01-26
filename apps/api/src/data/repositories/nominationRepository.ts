import { DbClient, query } from "../db.js";

export type NominationWithDisplay = {
  id: number;
  category_edition_id: number;
  film_id: number | null;
  song_id: number | null;
  performance_id: number | null;
  film_title: string | null;
  song_title: string | null;
  performer_name: string | null;
  contributors?: Array<{
    person_id: number;
    full_name: string;
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
       n.film_id::int,
       n.song_id::int,
       n.performance_id::int,
       n.status,
       n.replaced_by_nomination_id::int,
       COALESCE(f.title, sf.title) AS film_title,
       s.title AS song_title,
       primary_person.full_name AS performer_name,
       COALESCE(
         json_agg(
           json_build_object(
             'person_id', p2.id::int,
             'full_name', p2.full_name,
             'role_label', nc.role_label,
             'sort_order', nc.sort_order::int
           )
           ORDER BY nc.sort_order ASC, nc.id ASC
         ) FILTER (WHERE nc.id IS NOT NULL),
         '[]'::json
       ) AS contributors
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     LEFT JOIN film f ON f.id = n.film_id
     LEFT JOIN song s ON s.id = n.song_id
     LEFT JOIN film sf ON sf.id = s.film_id
     LEFT JOIN LATERAL (
       SELECT p.full_name
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
       n.film_id,
       n.song_id,
       n.performance_id,
       n.status,
       n.replaced_by_nomination_id,
       f.title,
       sf.title,
       s.title,
       primary_person.full_name
     ORDER BY n.category_edition_id, n.id`,
    [ceremonyId]
  );
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
