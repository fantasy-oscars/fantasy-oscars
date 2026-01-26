import "dotenv/config";

import { createPool, query } from "../data/db.js";
import { syncTmdbMovieById } from "../services/tmdbSync.js";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val && !val.startsWith("--")) {
      args.set(key, val);
      i += 1;
    } else {
      args.set(key, "true");
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const movieIdRaw = args.get("movie");
  const ceremonyIdRaw = args.get("ceremony");

  if (!movieIdRaw && !ceremonyIdRaw) {
    // eslint-disable-next-line no-console
    console.error(
      "Usage:\n  tsx src/scripts/sync-tmdb.ts --movie <tmdbMovieId>\n  tsx src/scripts/sync-tmdb.ts --ceremony <ceremonyId>"
    );
    process.exit(2);
  }

  const pool = createPool(process.env.DATABASE_URL ?? "");

  if (movieIdRaw) {
    const tmdbMovieId = Number(movieIdRaw);
    if (!Number.isFinite(tmdbMovieId) || tmdbMovieId <= 0)
      throw new Error("Invalid --movie");
    const result = await syncTmdbMovieById(pool, tmdbMovieId);
    // eslint-disable-next-line no-console
    console.log(result);
    await pool.end();
    return;
  }

  const ceremonyId = Number(ceremonyIdRaw);
  if (!Number.isFinite(ceremonyId) || ceremonyId <= 0)
    throw new Error("Invalid --ceremony");

  const { rows } = await query<{ tmdb_id: number | null }>(
    pool,
    `SELECT f.tmdb_id
     FROM ceremony_film_candidate c
     JOIN film f ON f.id = c.film_id
     WHERE c.ceremony_id = $1
     ORDER BY f.id ASC`,
    [ceremonyId]
  );
  const tmdbIds = rows
    .map((r) => r.tmdb_id)
    .filter((v): v is number => typeof v === "number");
  if (tmdbIds.length === 0) {
    // eslint-disable-next-line no-console
    console.log({
      ceremonyId,
      synced: 0,
      message: "No candidate films with tmdb_id found."
    });
    await pool.end();
    return;
  }

  let synced = 0;
  for (const tmdbId of tmdbIds) {
    await syncTmdbMovieById(pool, tmdbId);
    synced += 1;
  }

  // eslint-disable-next-line no-console
  console.log({ ceremonyId, synced });
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
