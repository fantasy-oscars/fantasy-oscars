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
       f.title AS film_title,
       s.title AS song_title,
       p.full_name AS performer_name
     FROM nomination n
     JOIN category_edition ce ON ce.id = n.category_edition_id
     LEFT JOIN film f ON f.id = n.film_id
     LEFT JOIN song s ON s.id = n.song_id
     LEFT JOIN performance perf ON perf.id = n.performance_id
     LEFT JOIN person p ON p.id = perf.person_id
     WHERE ce.ceremony_id = $1
     ORDER BY ce.id, n.id`,
    [ceremonyId]
  );
  return rows;
}
