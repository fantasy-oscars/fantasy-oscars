import { Pool } from "pg";
import { buildSeason } from "./builders.js";

export async function insertSeason(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildSeason>> = {}
) {
  const season = buildSeason(overrides);
  await pool.query(
    `INSERT INTO season (id, league_id, ceremony_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [season.id, season.league_id, season.ceremony_id, season.status, season.created_at]
  );
  return season;
}
