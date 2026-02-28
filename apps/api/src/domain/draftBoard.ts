import { query, type DbClient } from "../data/db.js";
import { listNominationsForCeremony } from "../data/repositories/nominationRepository.js";

export type DraftBoardCategory = {
  id: number;
  unit_kind: string;
  sort_index: number;
  family_name: string;
  icon_code: string | null;
  icon_variant: "default" | "inverted";
};

export type DraftBoardNomination = {
  id: number;
  category_edition_id: number;
  label: string;
  status: string;
  film_title?: string | null;
  film_poster_url?: string | null;
  film_year?: number | null;
  contributors?: string[];
  performer_contributors?: Array<{
    full_name: string;
    role_label: string | null;
    profile_url: string | null;
    profile_path: string | null;
    sort_order: number;
  }>;
  song_title?: string | null;
  performer_name?: string | null;
  performer_character?: string | null;
  performer_profile_url?: string | null;
  performer_profile_path?: string | null;
};

export async function getDraftBoardForCeremony(
  db: DbClient,
  ceremonyId: number
): Promise<{ categories: DraftBoardCategory[]; nominations: DraftBoardNomination[] }> {
  const categories =
    (
      await query<DraftBoardCategory>(
        db,
        `SELECT
           ce.id::int,
           ce.unit_kind,
           ce.sort_index::int,
           ce.name AS family_name,
           i.code AS icon_code,
           ce.icon_variant
         FROM category_edition ce
         LEFT JOIN icon i ON i.id = ce.icon_id
         WHERE ce.ceremony_id = $1
         ORDER BY ce.sort_index ASC, ce.id ASC`,
        [ceremonyId]
      )
    ).rows ?? [];

  const unitKindByCategoryId = new Map<number, string>();
  for (const c of categories) {
    unitKindByCategoryId.set(Number(c.id), String(c.unit_kind));
  }

  const nominations = (await listNominationsForCeremony(db, ceremonyId)).map((n) => {
    // Draft board display label follows the category's unit kind, not incidental
    // contributor data (e.g. producers attached to Best Picture).
    const kind = unitKindByCategoryId.get(Number(n.category_edition_id)) ?? "";
    const songLabel = n.song_title ? `"${n.song_title}"` : null;
    const label =
      kind === "SONG"
        ? (songLabel ?? n.film_title ?? `Nomination #${n.id}`)
        : kind === "PERFORMANCE"
          ? (n.performer_name ?? songLabel ?? n.film_title ?? `Nomination #${n.id}`)
          : (n.film_title ?? songLabel ?? n.performer_name ?? `Nomination #${n.id}`);
    return {
      id: n.id,
      category_edition_id: n.category_edition_id,
      label,
      status: n.status ?? "ACTIVE",
      film_title: n.film_title ?? null,
      film_poster_url: n.film_poster_url ?? null,
      film_year: n.film_year ?? null,
      contributors: (n.contributors ?? []).map((c) => c.full_name),
      performer_contributors: (n.contributors ?? []).map((c) => ({
        full_name: c.full_name,
        role_label: c.role_label ?? null,
        profile_url: c.profile_url ?? null,
        profile_path: c.profile_path ?? null,
        sort_order: c.sort_order
      })),
      song_title: n.song_title ?? null,
      performer_name: n.performer_name ?? null,
      performer_character: n.performer_character ?? null,
      performer_profile_url: n.performer_profile_url ?? null,
      performer_profile_path: n.performer_profile_path ?? null
    };
  });

  return { categories, nominations };
}
