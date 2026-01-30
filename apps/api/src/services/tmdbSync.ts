import { Pool, PoolClient } from "pg";
import { query, runInTransaction } from "../data/db";
import {
  buildTmdbImageUrlFromConfig,
  fetchTmdbMovieDetailsWithCredits,
  fetchTmdbPersonDetails,
  getTmdbImageConfig,
  parseReleaseYear
} from "../lib/tmdb";

export type SyncTmdbMovieResult = {
  tmdbMovieId: number;
  filmId: number;
  title: string;
  releaseYear: number | null;
  peopleUpserted: number;
  creditsInserted: number;
};

async function upsertPersonFromCredit(
  client: PoolClient,
  input: {
    tmdbPersonId: number;
    name: string;
    profilePath?: string | null;
    profileUrl?: string | null;
  }
): Promise<number> {
  const res = await query<{ id: string }>(
    client,
    `INSERT INTO person (full_name, tmdb_id, profile_path, profile_url, external_ids, updated_at)
     VALUES ($1, $2::int, $3, $4, jsonb_build_object('tmdb_id', $2::int), now())
     ON CONFLICT (tmdb_id)
     DO UPDATE SET
       full_name = EXCLUDED.full_name,
       profile_path = COALESCE(EXCLUDED.profile_path, person.profile_path),
       profile_url = COALESCE(EXCLUDED.profile_url, person.profile_url),
       external_ids = COALESCE(person.external_ids, '{}'::jsonb) || COALESCE(EXCLUDED.external_ids, '{}'::jsonb),
       updated_at = now()
     RETURNING id`,
    [input.name, input.tmdbPersonId, input.profilePath ?? null, input.profileUrl ?? null]
  );

  return Number(res.rows[0]?.id);
}

async function upsertFilmFromMovie(
  client: PoolClient,
  input: {
    tmdbMovieId: number;
    title: string;
    releaseYear: number | null;
    posterPath?: string | null;
    posterUrl?: string | null;
  }
): Promise<number> {
  const res = await query<{ id: string }>(
    client,
    `INSERT INTO film (title, tmdb_id, release_year, poster_path, poster_url, external_ids, tmdb_last_synced_at)
     VALUES ($1, $2::int, $3, $4, $5, jsonb_build_object('tmdb_id', $2::int), now())
     ON CONFLICT (tmdb_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       release_year = COALESCE(EXCLUDED.release_year, film.release_year),
       poster_path = COALESCE(EXCLUDED.poster_path, film.poster_path),
       poster_url = COALESCE(EXCLUDED.poster_url, film.poster_url),
       external_ids = COALESCE(film.external_ids, '{}'::jsonb) || COALESCE(EXCLUDED.external_ids, '{}'::jsonb),
       tmdb_last_synced_at = now()
     RETURNING id`,
    [
      input.title,
      input.tmdbMovieId,
      input.releaseYear,
      input.posterPath ?? null,
      input.posterUrl ?? null
    ]
  );

  return Number(res.rows[0]?.id);
}

async function replaceFilmCredits(
  client: PoolClient,
  filmId: number,
  credits: {
    cast: Array<{
      tmdbPersonId: number;
      name: string;
      profilePath?: string | null;
      creditId?: string | null;
      character?: string | null;
      order?: number | null;
    }>;
    crew: Array<{
      tmdbPersonId: number;
      name: string;
      profilePath?: string | null;
      creditId?: string | null;
      department?: string | null;
      job?: string | null;
    }>;
  }
): Promise<{ peopleUpserted: number; creditsInserted: number }> {
  await query(client, "DELETE FROM film_credit WHERE film_id = $1", [filmId]);

  let peopleUpserted = 0;
  let creditsInserted = 0;

  for (const c of credits.cast) {
    const personId = await upsertPersonFromCredit(client, {
      tmdbPersonId: c.tmdbPersonId,
      name: c.name,
      profilePath: c.profilePath ?? null
    });
    peopleUpserted += 1;
    await query(
      client,
      `INSERT INTO film_credit
        (film_id, person_id, credit_type, department, job, character, cast_order, tmdb_credit_id)
       VALUES ($1,$2,'CAST',NULL,NULL,$3,$4,$5)`,
      [filmId, personId, c.character ?? null, c.order ?? null, c.creditId ?? null]
    );
    creditsInserted += 1;
  }

  for (const c of credits.crew) {
    const personId = await upsertPersonFromCredit(client, {
      tmdbPersonId: c.tmdbPersonId,
      name: c.name,
      profilePath: c.profilePath ?? null
    });
    peopleUpserted += 1;
    await query(
      client,
      `INSERT INTO film_credit
        (film_id, person_id, credit_type, department, job, character, cast_order, tmdb_credit_id)
       VALUES ($1,$2,'CREW',$3,$4,NULL,NULL,$5)`,
      [filmId, personId, c.department ?? null, c.job ?? null, c.creditId ?? null]
    );
    creditsInserted += 1;
  }

  return { peopleUpserted, creditsInserted };
}

export async function syncTmdbMovieById(
  pool: Pool,
  tmdbMovieId: number
): Promise<SyncTmdbMovieResult> {
  const [cfg, movie] = await Promise.all([
    getTmdbImageConfig(),
    fetchTmdbMovieDetailsWithCredits(tmdbMovieId)
  ]);

  const releaseYear = parseReleaseYear(movie.release_date ?? null);
  const posterUrl = buildTmdbImageUrlFromConfig(
    cfg,
    "poster",
    movie.poster_path ?? null,
    "w500"
  );

  const cast = (movie.credits?.cast ?? []).map((c) => ({
    tmdbPersonId: c.id,
    name: c.name,
    profilePath: c.profile_path ?? null,
    profileUrl: buildTmdbImageUrlFromConfig(
      cfg,
      "profile",
      c.profile_path ?? null,
      "w185"
    ),
    creditId: c.credit_id ?? null,
    character: c.character ?? null,
    order: c.order ?? null
  }));
  const crew = (movie.credits?.crew ?? []).map((c) => ({
    tmdbPersonId: c.id,
    name: c.name,
    profilePath: c.profile_path ?? null,
    profileUrl: buildTmdbImageUrlFromConfig(
      cfg,
      "profile",
      c.profile_path ?? null,
      "w185"
    ),
    creditId: c.credit_id ?? null,
    department: c.department ?? null,
    job: c.job ?? null
  }));

  return runInTransaction(pool, async (client) => {
    const filmId = await upsertFilmFromMovie(client, {
      tmdbMovieId,
      title: movie.title,
      releaseYear,
      posterPath: movie.poster_path ?? null,
      posterUrl
    });

    const { peopleUpserted, creditsInserted } = await replaceFilmCredits(client, filmId, {
      cast,
      crew
    });

    return {
      tmdbMovieId,
      filmId,
      title: movie.title,
      releaseYear,
      peopleUpserted,
      creditsInserted
    };
  });
}

export async function syncTmdbPersonById(
  pool: Pool,
  tmdbPersonId: number
): Promise<number> {
  const cfg = await getTmdbImageConfig();
  return runInTransaction(pool, async (client) => {
    const person = await fetchTmdbPersonDetails(tmdbPersonId);
    const profileUrl = buildTmdbImageUrlFromConfig(
      cfg,
      "profile",
      person.profile_path ?? null,
      "w185"
    );
    const res = await query<{ id: string }>(
      client,
      `INSERT INTO person (full_name, tmdb_id, profile_path, profile_url, external_ids, updated_at)
       VALUES ($1, $2::int, $3, $4, jsonb_build_object('tmdb_id', $2::int), now())
       ON CONFLICT (tmdb_id)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         profile_path = COALESCE(EXCLUDED.profile_path, person.profile_path),
         profile_url = COALESCE(EXCLUDED.profile_url, person.profile_url),
         external_ids = COALESCE(person.external_ids, '{}'::jsonb) || COALESCE(EXCLUDED.external_ids, '{}'::jsonb),
         updated_at = now()
       RETURNING id`,
      [person.name, person.id, person.profile_path ?? null, profileUrl]
    );
    return Number(res.rows[0]?.id);
  });
}
