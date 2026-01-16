import { Pool } from "pg";
import {
  buildAuthPassword,
  buildCategoryEdition,
  buildCategoryFamily,
  buildCeremony,
  buildSeason,
  buildDraft,
  buildDraftPick,
  buildDraftSeat,
  buildFilm,
  buildIcon,
  buildLeague,
  buildLeagueMember,
  buildNomination,
  buildPerformance,
  buildPerson,
  buildSong,
  buildUser
} from "./builders.js";

/**
 * These helpers insert deterministic rows into the database.
 * Each will create required dependencies if not provided via overrides.
 */

export async function insertIcon(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildIcon>> = {}
) {
  const icon = buildIcon(overrides);
  await pool.query(
    `INSERT INTO icon (id, code, name, asset_path) VALUES ($1, $2, $3, $4)`,
    [icon.id, icon.code, icon.name, icon.asset_path]
  );
  return icon;
}

export async function insertCeremony(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildCeremony>> = {},
  setActive = true
) {
  const ceremony = buildCeremony(overrides);
  await pool.query(
    `INSERT INTO ceremony (id, code, name, year) VALUES ($1, $2, $3, $4)`,
    [ceremony.id, ceremony.code, ceremony.name, ceremony.year]
  );
  if (setActive) {
    await pool.query(
      `INSERT INTO app_config (id, active_ceremony_id)
       VALUES (TRUE, $1)
       ON CONFLICT (id) DO UPDATE
       SET active_ceremony_id = COALESCE(app_config.active_ceremony_id, EXCLUDED.active_ceremony_id)`,
      [ceremony.id]
    );
  }
  return ceremony;
}

export async function insertCategoryFamily(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildCategoryFamily>> = {}
) {
  const icon = overrides.icon_id ? null : await insertIcon(pool);

  const fam = buildCategoryFamily({
    icon_id: overrides.icon_id ?? icon?.id ?? 1,
    ...overrides
  });

  await pool.query(
    `INSERT INTO category_family
     (id, code, name, icon_id, default_unit_kind)
     VALUES ($1,$2,$3,$4,$5)`,
    [fam.id, fam.code, fam.name, fam.icon_id, fam.default_unit_kind]
  );
  return fam;
}

export async function insertCategoryEdition(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildCategoryEdition>> = {}
) {
  const ceremony = overrides.ceremony_id ? null : await insertCeremony(pool);
  const fam = overrides.family_id ? null : await insertCategoryFamily(pool);

  const cat = buildCategoryEdition({
    ceremony_id: overrides.ceremony_id ?? ceremony?.id ?? 1,
    family_id: overrides.family_id ?? fam?.id ?? 1,
    ...overrides
  });

  await pool.query(
    `INSERT INTO category_edition
     (id, ceremony_id, family_id, unit_kind, icon_id, sort_index)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [cat.id, cat.ceremony_id, cat.family_id, cat.unit_kind, cat.icon_id, cat.sort_index]
  );
  return cat;
}

export async function insertFilm(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildFilm>> = {}
) {
  const film = buildFilm(overrides);
  await pool.query(`INSERT INTO film (id, title, country) VALUES ($1, $2, $3)`, [
    film.id,
    film.title,
    film.country
  ]);
  return film;
}

export async function insertPerson(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildPerson>> = {}
) {
  const person = buildPerson(overrides);
  await pool.query(`INSERT INTO person (id, full_name) VALUES ($1, $2)`, [
    person.id,
    person.full_name
  ]);
  return person;
}

export async function insertSong(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildSong>> = {}
) {
  const film = overrides.film_id ? null : await insertFilm(pool);
  const song = buildSong({ film_id: overrides.film_id ?? film?.id ?? 1, ...overrides });
  await pool.query(`INSERT INTO song (id, title, film_id) VALUES ($1, $2, $3)`, [
    song.id,
    song.title,
    song.film_id
  ]);
  return song;
}

export async function insertPerformance(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildPerformance>> = {}
) {
  const film = overrides.film_id ? null : await insertFilm(pool);
  const person = overrides.person_id ? null : await insertPerson(pool);
  const perf = buildPerformance({
    film_id: overrides.film_id ?? film?.id ?? 1,
    person_id: overrides.person_id ?? person?.id ?? 1,
    ...overrides
  });
  await pool.query(
    `INSERT INTO performance (id, film_id, person_id) VALUES ($1, $2, $3)`,
    [perf.id, perf.film_id, perf.person_id]
  );
  return perf;
}

export async function insertNomination(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildNomination>> = {}
) {
  // Allow callers to hint the ceremony; not part of buildNomination's shape so accept loosely.
  const overrideCeremony =
    (overrides as { ceremony_id?: number | null }).ceremony_id ?? null;
  let ceremonyIdOverride = overrideCeremony;
  if (!ceremonyIdOverride) {
    const { rows } = await pool.query<{ active_ceremony_id: number | null }>(
      `SELECT active_ceremony_id FROM app_config WHERE id = TRUE`
    );
    ceremonyIdOverride = rows[0]?.active_ceremony_id ?? null;
  }

  const category = overrides.category_edition_id
    ? null
    : await insertCategoryEdition(
        pool,
        ceremonyIdOverride ? { ceremony_id: ceremonyIdOverride } : {}
      );
  const film = overrides.film_id ? null : await insertFilm(pool);
  const nomination = buildNomination({
    category_edition_id: overrides.category_edition_id ?? category?.id ?? 1,
    film_id: overrides.film_id ?? film?.id ?? 1,
    song_id: overrides.song_id ?? null,
    performance_id: overrides.performance_id ?? null,
    ...overrides
  });
  await pool.query(
    `INSERT INTO nomination (id, category_edition_id, film_id, song_id, performance_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      nomination.id,
      nomination.category_edition_id,
      nomination.film_id,
      nomination.song_id,
      nomination.performance_id
    ]
  );
  return nomination;
}

export async function insertUser(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildUser>> = {}
) {
  const user = buildUser(overrides);
  await pool.query(
    `INSERT INTO app_user (id, handle, email, display_name, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, user.handle, user.email, user.display_name, user.created_at]
  );
  return user;
}

export async function insertAuthPassword(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildAuthPassword>> = {}
) {
  const user = overrides.user_id ? null : await insertUser(pool);
  const auth = buildAuthPassword({
    user_id: overrides.user_id ?? user?.id ?? 1,
    ...overrides
  });
  await pool.query(
    `INSERT INTO auth_password (user_id, password_hash, password_algo, password_set_at)
     VALUES ($1, $2, $3, $4)`,
    [auth.user_id, auth.password_hash, auth.password_algo, auth.password_set_at]
  );
  return auth;
}

export async function insertLeague(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildLeague>> = {}
) {
  const ceremony = overrides.ceremony_id ? null : await insertCeremony(pool);
  const owner = overrides.created_by_user_id ? null : await insertUser(pool);
  const league = buildLeague({
    ceremony_id: overrides.ceremony_id ?? ceremony?.id ?? 1,
    created_by_user_id: overrides.created_by_user_id ?? owner?.id ?? 1,
    ...overrides
  });
  await pool.query(
    `INSERT INTO league
     (id, code, name, ceremony_id, max_members, roster_size, is_public, created_by_user_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      league.id,
      league.code,
      league.name,
      league.ceremony_id,
      league.max_members,
      league.roster_size,
      league.is_public,
      league.created_by_user_id,
      league.created_at
    ]
  );
  return league;
}

export async function insertSeason(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildSeason>> = {}
) {
  const league = overrides.league_id ? null : await insertLeague(pool);
  const season = buildSeason({
    league_id: overrides.league_id ?? league?.id ?? 1,
    ceremony_id: overrides.ceremony_id ?? league?.ceremony_id ?? 1,
    status: overrides.status ?? "EXTANT",
    ...overrides
  });
  await pool.query(
    `INSERT INTO season (id, league_id, ceremony_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [season.id, season.league_id, season.ceremony_id, season.status, season.created_at]
  );
  return season;
}

export async function insertLeagueMember(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildLeagueMember>> = {}
) {
  const league = overrides.league_id ? null : await insertLeague(pool);
  const user = overrides.user_id ? null : await insertUser(pool);
  const member = buildLeagueMember({
    league_id: overrides.league_id ?? league?.id ?? 1,
    user_id: overrides.user_id ?? user?.id ?? 1,
    ...overrides
  });
  await pool.query(
    `INSERT INTO league_member (id, league_id, user_id, role, joined_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [member.id, member.league_id, member.user_id, member.role, member.joined_at]
  );
  return member;
}

export async function insertDraft(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildDraft>> = {}
) {
  let leagueId = overrides.league_id ?? null;
  let ceremonyId: number | null = null;
  if (!leagueId) {
    const league = await insertLeague(pool);
    leagueId = league.id;
    ceremonyId = league.ceremony_id;
  } else {
    if (!ceremonyId) {
      const { rows } = await pool.query<{ ceremony_id: number }>(
        `SELECT ceremony_id FROM league WHERE id = $1`,
        [leagueId]
      );
      ceremonyId = rows[0]?.ceremony_id ?? 1;
    }
  }

  let seasonId = overrides.season_id ?? null;
  if (!seasonId) {
    const season = await insertSeason(pool, {
      league_id: leagueId,
      ceremony_id: ceremonyId
    });
    seasonId = season.id;
  }

  const draft = buildDraft({
    league_id: leagueId ?? 1,
    season_id: seasonId ?? 1,
    ...overrides
  });
  await pool.query(
    `INSERT INTO draft (id, league_id, season_id, status, draft_order_type, current_pick_number, version, started_at, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      draft.id,
      draft.league_id,
      draft.season_id,
      draft.status,
      draft.draft_order_type,
      draft.current_pick_number,
      draft.version,
      draft.started_at,
      draft.completed_at
    ]
  );
  return draft;
}

export async function insertDraftSeat(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildDraftSeat>> = {}
) {
  const draft = overrides.draft_id ? null : await insertDraft(pool);
  const member = overrides.league_member_id ? null : await insertLeagueMember(pool);
  const seat = buildDraftSeat({
    draft_id: overrides.draft_id ?? draft?.id ?? 1,
    league_member_id: overrides.league_member_id ?? member?.id ?? 1,
    ...overrides
  });
  await pool.query(
    `INSERT INTO draft_seat (id, draft_id, league_member_id, seat_number, is_active)
     VALUES ($1, $2, $3, $4, $5)`,
    [seat.id, seat.draft_id, seat.league_member_id, seat.seat_number, seat.is_active]
  );
  return seat;
}

export async function insertDraftPick(
  pool: Pool,
  overrides: Partial<ReturnType<typeof buildDraftPick>> = {}
) {
  const draft = overrides.draft_id ? null : await insertDraft(pool);
  const member = overrides.league_member_id ? null : await insertLeagueMember(pool);
  const ensuredUser =
    overrides.user_id || member?.user_id ? null : await insertUser(pool);
  const userId = overrides.user_id ?? member?.user_id ?? ensuredUser?.id;
  const nomination = overrides.nomination_id ? null : await insertNomination(pool);
  const pick = buildDraftPick({
    draft_id: overrides.draft_id ?? draft?.id ?? 1,
    league_member_id: overrides.league_member_id ?? member?.id ?? 1,
    user_id: userId ?? 1,
    nomination_id: overrides.nomination_id ?? nomination?.id ?? 1,
    ...overrides
  });
  await pool.query(
    `INSERT INTO draft_pick
     (id, draft_id, pick_number, round_number, seat_number, league_member_id, user_id, nomination_id, made_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      pick.id,
      pick.draft_id,
      pick.pick_number,
      pick.round_number,
      pick.seat_number,
      pick.league_member_id,
      pick.user_id,
      pick.nomination_id,
      pick.made_at
    ]
  );
  const { rows: versionRows } = await pool.query<{ version: number }>(
    `UPDATE draft
     SET version = version + 1
     WHERE id = $1
     RETURNING version::int`,
    [pick.draft_id]
  );
  const version = versionRows[0]?.version ?? 0;
  await pool.query(
    `INSERT INTO draft_event (draft_id, version, event_type, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      pick.draft_id,
      version,
      "draft.pick.submitted",
      JSON.stringify({
        pick: {
          id: pick.id,
          draft_id: pick.draft_id,
          pick_number: pick.pick_number,
          round_number: pick.round_number,
          seat_number: pick.seat_number,
          league_member_id: pick.league_member_id,
          user_id: pick.user_id,
          nomination_id: pick.nomination_id,
          made_at: pick.made_at
        }
      })
    ]
  );
  return pick;
}
