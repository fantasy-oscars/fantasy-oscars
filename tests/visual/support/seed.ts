import type { Pool } from "pg";
import { loadNominees } from "../../../apps/api/src/scripts/load-nominees";
import { E2E_API_ORIGIN } from "../../e2e/support/stack";
import {
  buildDataset,
  CATEGORY_DEFS,
  NOMINEES_PER_CATEGORY,
  seededShuffle,
  snakePick
} from "./dataset";

export const PASSWORD = "secret123";

/** Every persona the screen matrix can sign in as. */
export const PERSONAS = {
  /** Site admin; not a league participant. */
  admin: { username: "curator", avatar: "owl" },
  /** League commissioner, and on the clock in the live draft. */
  avery: { username: "avery", avatar: "giraffe" },
  /** Participant who is not on the clock in the live draft. */
  blake: { username: "blake", avatar: "bear" },
  /** Two-letter username (the validation minimum). */
  jo: { username: "jo", avatar: "cat" },
  /** Very long username, to exercise truncation and wrapping. */
  long: {
    username: "theatre-obsessive-and-world-cinema-completionist-since-1999",
    avatar: "elephant"
  },
  casey: { username: "casey", avatar: "penguin" },
  drew: { username: "drew", avatar: "whale" },
  /** Signed up, but belongs to no league. */
  newcomer: { username: "newcomer", avatar: "rabbit" }
} as const;
export type PersonaKey = keyof typeof PERSONAS;

/** Fixed point in time the whole suite pretends it is (see support/page.ts). */
export const FIXED_NOW = "2035-02-10T18:00:00.000Z";

export type VisualSeed = {
  tokens: Record<PersonaKey, string>;
  ceremonies: { completed: number; upcoming: number; draft: number };
  leagues: { main: number; second: number; third: number; fourth: number };
  seasons: { completed: number; live: number; pending: number };
  /**
   * Competitions in the seeded Circuit (seasons to players): the main league's
   * in setup; the second league's in season with free agency open; the third
   * league's in season inside a waiver window; the fourth league's complete,
   * with a scoring ledger.
   */
  circuitLeagues: { main: number; inSeason: number; inWindow: number; complete: number };
  /**
   * A league avery commissions that plays no full season, so Create season
   * offers both open awards seasons.
   */
  matineeLeague: number;
  drafts: { completed: number; live: number; pending: number };
  /** An unused id for the 404 and missing-entity screens. */
  missingId: number;
};

const PARTICIPANTS: PersonaKey[] = ["avery", "jo", "long", "blake", "casey", "drew"];
const T0 = Date.parse("2034-01-10T15:00:00.000Z");
const minutes = (n: number) => new Date(T0 + n * 60_000).toISOString();

async function one<T>(pool: Pool, text: string, values: unknown[] = []): Promise<T> {
  const { rows } = await pool.query(text, values);
  return rows[0] as T;
}

async function login(username: string): Promise<string> {
  const res = await fetch(`${E2E_API_ORIGIN}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD })
  });
  if (!res.ok) throw new Error(`login ${username} -> ${res.status}`);
  for (const cookie of res.headers.getSetCookie()) {
    const match = /^auth_token=([^;]+)/.exec(cookie);
    if (match?.[1]) return match[1];
  }
  throw new Error(`login ${username} did not set an auth_token cookie`);
}

async function createUsers(pool: Pool): Promise<Record<PersonaKey, number>> {
  // The API hashes passwords; register one account through it and reuse the hash.
  const res = await fetch(`${E2E_API_ORIGIN}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: PERSONAS.admin.username,
      email: `${PERSONAS.admin.username}@example.com`,
      password: PASSWORD
    })
  });
  if (!res.ok) throw new Error(`register admin -> ${res.status}`);
  const admin = await one<{ id: number }>(
    pool,
    `SELECT id::int FROM app_user WHERE username = $1`,
    [PERSONAS.admin.username]
  );
  const hash = await one<{ password_hash: string; password_algo: string }>(
    pool,
    `SELECT password_hash, password_algo FROM auth_password WHERE user_id = $1`,
    [admin.id]
  );
  await pool.query(
    `UPDATE app_user SET is_admin = TRUE, avatar_key = $2, created_at = $3 WHERE id = $1`,
    [admin.id, PERSONAS.admin.avatar, minutes(0)]
  );
  await pool.query(`UPDATE auth_password SET password_set_at = $2 WHERE user_id = $1`, [
    admin.id,
    minutes(0)
  ]);

  const ids = { admin: admin.id } as Record<PersonaKey, number>;
  let n = 1;
  for (const key of Object.keys(PERSONAS) as PersonaKey[]) {
    if (key === "admin") continue;
    const p = PERSONAS[key];
    const row = await one<{ id: number }>(
      pool,
      `INSERT INTO app_user (username, email, created_at, avatar_key)
       VALUES ($1, $2, $3, $4) RETURNING id::int`,
      [p.username, `${p.username}@example.com`, minutes(n++), p.avatar]
    );
    await pool.query(
      `INSERT INTO auth_password (user_id, password_hash, password_algo, password_set_at)
       VALUES ($1, $2, $3, $4)`,
      [row.id, hash.password_hash, hash.password_algo, minutes(n)]
    );
    ids[key] = row.id;
  }
  return ids;
}

type SeasonSetup = {
  leagueId: number;
  ceremonyId: number;
  members: { key: PersonaKey; leagueMemberId: number }[];
  createdAt: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  /** Number of picks already made. */
  picks: number;
  /** First nomination id of the ceremony (ids are contiguous per ceremony). */
  firstNominationId: number;
  shuffleSeed: number;
  userIds: Record<PersonaKey, number>;
  startedAt?: string;
  completedAt?: string;
};

async function createSeason(pool: Pool, s: SeasonSetup) {
  const season = await one<{ id: number }>(
    pool,
    `INSERT INTO season (league_id, ceremony_id, status, scoring_strategy_name, created_at)
     VALUES ($1, $2, 'EXTANT', 'fixed', $3) RETURNING id::int`,
    [s.leagueId, s.ceremonyId, s.createdAt]
  );
  for (const m of s.members) {
    await pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role, joined_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        season.id,
        s.userIds[m.key],
        m.leagueMemberId,
        m.key === "avery" ? "OWNER" : "MEMBER",
        s.createdAt
      ]
    );
  }

  const seatCount = s.members.length;
  const nominations = CATEGORY_DEFS.length * NOMINEES_PER_CATEGORY;
  const picksPerSeat = Math.floor(nominations / seatCount);
  const totalPicks = picksPerSeat * seatCount;
  const draft = await one<{ id: number }>(
    pool,
    `INSERT INTO draft (league_id, season_id, status, draft_order_type, current_pick_number,
                        picks_per_seat, remainder_strategy, total_picks, started_at,
                        completed_at, version)
     VALUES ($1, $2, $3, 'SNAKE', $4, $5, 'UNDRAFTED', $6, $7, $8, $9) RETURNING id::int`,
    [
      s.leagueId,
      season.id,
      s.status,
      s.status === "IN_PROGRESS" ? s.picks + 1 : null,
      s.status === "PENDING" ? null : picksPerSeat,
      s.status === "PENDING" ? null : totalPicks,
      s.startedAt ?? null,
      s.completedAt ?? null,
      s.status === "PENDING" ? 0 : s.picks + 1
    ]
  );
  if (s.status === "PENDING") return { seasonId: season.id, draftId: draft.id };

  for (const [i, m] of s.members.entries()) {
    await pool.query(
      `INSERT INTO draft_seat (draft_id, league_member_id, seat_number, is_active)
       VALUES ($1, $2, $3, TRUE)`,
      [draft.id, m.leagueMemberId, i + 1]
    );
  }
  const order = seededShuffle(
    Array.from({ length: nominations }, (_, i) => s.firstNominationId + i),
    s.shuffleSeed
  );
  const startedMs = Date.parse(s.startedAt ?? s.createdAt);
  for (let pick = 1; pick <= s.picks; pick++) {
    const { round, seat } = snakePick(pick, seatCount);
    const member = s.members[seat - 1]!;
    await pool.query(
      `INSERT INTO draft_pick (draft_id, pick_number, round_number, seat_number,
                               league_member_id, nomination_id, made_at, request_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        draft.id,
        pick,
        round,
        seat,
        member.leagueMemberId,
        order[pick - 1],
        new Date(startedMs + pick * 90_000).toISOString(),
        `visual-${draft.id}-${pick}`,
        s.userIds[member.key]
      ]
    );
  }
  return { seasonId: season.id, draftId: draft.id };
}

/**
 * Builds the full visual dataset on top of a freshly migrated database and returns
 * the ids and session tokens the screen matrix needs. Must run after the API is up
 * (it registers the first account through it to reuse the password hashing).
 */
export async function seedVisual(pool: Pool): Promise<VisualSeed> {
  const userIds = await createUsers(pool);

  // Ceremonies: one finished (winners entered), one upcoming and live, one in draft.
  const ceremonyDefs = [
    { id: 1, code: "golden-reel-2034", name: "Golden Reel Awards 2034", year: 2034 },
    { id: 2, code: "golden-reel-2035", name: "Golden Reel Awards 2035", year: 2035 },
    { id: 3, code: "golden-reel-2036", name: "Golden Reel Awards 2036", year: 2036 }
  ];
  const ceremonyStatus = ["LOCKED", "ACTIVE", "DRAFT"];
  const startsAt = [
    "2034-03-06T01:00:00Z",
    "2035-03-05T01:00:00Z",
    "2036-03-03T01:00:00Z"
  ];
  for (const [i, c] of ceremonyDefs.entries()) {
    await pool.query(
      `INSERT INTO ceremony
         (id, code, name, year, starts_at, status, published_at, results_finalized_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        c.id,
        c.code,
        c.name,
        c.year,
        startsAt[i],
        ceremonyStatus[i],
        ceremonyStatus[i] === "DRAFT" ? null : minutes(100 + i),
        // The finished ceremony has finalized results.
        i === 0 ? minutes(200) : null
      ]
    );
  }
  await pool.query(
    `INSERT INTO app_config (id, active_ceremony_id) VALUES (TRUE, 2)
     ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`
  );
  await loadNominees(pool, buildDataset(ceremonyDefs.slice(0, 2)) as never);

  // Winners for the finished ceremony: one nomination per category.
  const perCeremony = CATEGORY_DEFS.length * NOMINEES_PER_CATEGORY;
  for (let e = 0; e < CATEGORY_DEFS.length; e++) {
    const nominationId =
      e * NOMINEES_PER_CATEGORY + 1 + ((e * 2) % NOMINEES_PER_CATEGORY);
    await pool.query(
      `INSERT INTO ceremony_winner (ceremony_id, category_edition_id, nomination_id, created_at, updated_at)
       VALUES (1, $1, $2, $3, $3)`,
      [e + 1, nominationId, minutes(200 + e)]
    );
  }

  // Leagues.
  const makeLeague = async (
    code: string,
    name: string,
    ownerKey: PersonaKey,
    at: number
  ) =>
    one<{ id: number }>(
      pool,
      `INSERT INTO league (code, name, max_members, roster_size, is_public, created_by_user_id, created_at)
       VALUES ($1, $2, 12, 6, FALSE, $3, $4) RETURNING id::int`,
      [code, name, userIds[ownerKey], minutes(at)]
    );
  const main = await makeLeague(
    "friday-night-film-club",
    "Friday Night Film Club",
    "avery",
    300
  );
  const second = await makeLeague(
    "weekend-cinephiles",
    "Weekend Cinephiles",
    "avery",
    310
  );

  const addMembers = async (leagueId: number, keys: PersonaKey[], at: number) => {
    const out: { key: PersonaKey; leagueMemberId: number }[] = [];
    for (const [i, key] of keys.entries()) {
      const row = await one<{ id: number }>(
        pool,
        `INSERT INTO league_member (league_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, $4) RETURNING id::int`,
        [leagueId, userIds[key], key === "avery" ? "OWNER" : "MEMBER", minutes(at + i)]
      );
      out.push({ key, leagueMemberId: row.id });
    }
    return out;
  };
  const mainMembers = await addMembers(main.id, PARTICIPANTS, 320);
  const secondMembers = await addMembers(second.id, ["avery", "jo", "casey"], 340);

  const completed = await createSeason(pool, {
    leagueId: main.id,
    ceremonyId: 1,
    members: mainMembers,
    createdAt: minutes(360),
    status: "COMPLETED",
    picks: 36,
    firstNominationId: 1,
    shuffleSeed: 2034,
    userIds,
    startedAt: "2034-02-20T19:00:00.000Z",
    completedAt: "2034-02-20T20:00:00.000Z"
  });
  const live = await createSeason(pool, {
    leagueId: main.id,
    ceremonyId: 2,
    members: mainMembers,
    createdAt: minutes(400),
    status: "IN_PROGRESS",
    // Twelve picks made: pick 13 opens round three, which seat one (avery) holds.
    picks: 12,
    firstNominationId: perCeremony + 1,
    shuffleSeed: 2035,
    userIds,
    startedAt: "2035-02-10T17:00:00.000Z"
  });
  const pending = await createSeason(pool, {
    leagueId: second.id,
    ceremonyId: 2,
    members: secondMembers,
    createdAt: minutes(420),
    status: "PENDING",
    picks: 0,
    firstNominationId: perCeremony + 1,
    shuffleSeed: 1,
    userIds
  });

  // A Circuit beside the main league's Seasons: one single-ceremony event, one
  // grouped event and three categories. avery started it and left; casey and
  // drew have joined, so avery's Home (a screenshot baseline) lists only Seasons.
  const circuit = await one<{ id: number }>(
    pool,
    `INSERT INTO circuit (code, name, status, activated_at, created_at)
     VALUES ('awards-season-2035', 'Awards Season 2035', 'ACTIVE', $1, $1)
     RETURNING id::int`,
    [minutes(460)]
  );
  const circuitEvents: Array<{
    code: string;
    name: string;
    group: boolean;
    ceremony: number;
  }> = [
    { code: "golden-reel", name: "Golden Reel Awards", group: false, ceremony: 2 },
    { code: "guild-awards", name: "Guild Awards", group: true, ceremony: 1 }
  ];
  for (const [i, e] of circuitEvents.entries()) {
    const event = await one<{ id: number }>(
      pool,
      `INSERT INTO circuit_event (circuit_id, code, name, sort_index, is_group)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::int`,
      [circuit.id, e.code, e.name, i, e.group]
    );
    await pool.query(
      `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
       VALUES ($1, $2, $3, $4)`,
      [circuit.id, e.ceremony, event.id, i]
    );
  }
  // Each category has its own icon (copied from its template, as an admin add
  // does): a season pill shows its category only by icon.
  const circuitCategories: Array<[string, string, "FILM" | "ACTING", string]> = [
    ["best-picture", "Best Picture", "FILM", "emoji_events"],
    ["best-director", "Best Director", "FILM", "movie"],
    ["best-actress", "Best Actress", "ACTING", "face"]
  ];
  for (const [i, [code, name, kind, icon]] of circuitCategories.entries()) {
    await pool.query(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index, icon_id)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM icon WHERE code = $6))`,
      [circuit.id, code, name, kind, i, icon]
    );
  }
  const circuitLeague = await one<{ id: number }>(
    pool,
    `INSERT INTO circuit_league (circuit_id, league_id, created_by_user_id, created_at)
     VALUES ($1, $2, $3, $4) RETURNING id::int`,
    [circuit.id, main.id, userIds.avery, minutes(470)]
  );
  await pool.query(
    `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id)
     SELECT $1, circuit_id, id FROM circuit_event WHERE circuit_id = $2`,
    [circuitLeague.id, circuit.id]
  );
  await pool.query(
    `INSERT INTO circuit_league_category (circuit_league_id, circuit_id, circuit_category_id)
     SELECT $1, circuit_id, id FROM circuit_category WHERE circuit_id = $2`,
    [circuitLeague.id, circuit.id]
  );
  for (const [i, key] of (["casey", "drew"] as PersonaKey[]).entries()) {
    await pool.query(
      `INSERT INTO circuit_league_member (circuit_league_id, user_id, joined_at)
       VALUES ($1, $2, $3)`,
      [circuitLeague.id, userIds[key], minutes(480 + i)]
    );
  }

  // A second open awards season, newer than the first, with a grouped event
  // that spans two ceremonies. The main league already plays it too (nobody
  // has joined, so no Home lists it), so Create season there offers no full
  // season; the second league plays only the first, so it is offered this one.
  const nextCircuit = await one<{ id: number }>(
    pool,
    `INSERT INTO circuit (code, name, status, activated_at, created_at)
     VALUES ('awards-season-2036', 'Awards Season 2036', 'ACTIVE', $1, $1)
     RETURNING id::int`,
    [minutes(490)]
  );
  const nextEvents: Array<{ code: string; name: string; group: boolean }> = [
    { code: "critics-circle", name: "Critics Circle Awards", group: false },
    {
      code: "guild-week",
      name: "Producers, Directors, Writers and Actors Guild Awards",
      group: true
    }
  ];
  for (const [i, e] of nextEvents.entries()) {
    const event = await one<{ id: number }>(
      pool,
      `INSERT INTO circuit_event (circuit_id, code, name, sort_index, is_group)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::int`,
      [nextCircuit.id, e.code, e.name, i, e.group]
    );
    if (e.group) {
      for (const [j, ceremonyId] of [1, 2].entries()) {
        await pool.query(
          `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
           VALUES ($1, $2, $3, $4)`,
          [nextCircuit.id, ceremonyId, event.id, j]
        );
      }
    }
  }
  for (const [i, [code, name, kind, icon]] of [
    ["best-picture", "Best Picture", "FILM", "emoji_events"],
    ["best-international-feature", "Best International Feature Film", "FILM", "videocam"],
    ["best-actor", "Best Actor", "ACTING", "person"]
  ].entries()) {
    await pool.query(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index, icon_id)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM icon WHERE code = $6))`,
      [nextCircuit.id, code, name, kind, i, icon]
    );
  }
  const mainNext = await one<{ id: number }>(
    pool,
    `INSERT INTO circuit_league (circuit_id, league_id, created_by_user_id, created_at)
     VALUES ($1, $2, $3, $4) RETURNING id::int`,
    [nextCircuit.id, main.id, userIds.avery, minutes(495)]
  );
  await pool.query(
    `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id)
     SELECT $1, circuit_id, id FROM circuit_event WHERE circuit_id = $2`,
    [mainNext.id, nextCircuit.id]
  );
  await pool.query(
    `INSERT INTO circuit_league_category (circuit_league_id, circuit_id, circuit_category_id)
     SELECT $1, circuit_id, id FROM circuit_category WHERE circuit_id = $2`,
    [mainNext.id, nextCircuit.id]
  );
  const matinee = await makeLeague(
    "sunday-matinee-club",
    "Sunday Matinee Club",
    "avery",
    500
  );
  await addMembers(matinee.id, ["avery", "casey"], 505);

  // Two in-season competitions with rosters and a transaction log. The
  // second league enables only the Golden Reel event, whose one dated occasion
  // is its final one, so it never has a waiver window and free agency is open.
  // A third league (blake's, so avery's Home is unchanged) enables both events.
  // Waiver windows are judged by the server's real clock, not FIXED_NOW, so
  // the Guild Awards nomination day is today in Pacific time: that league is
  // always inside a window and free agency is refused there.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles"
  }).format(new Date());
  await pool.query(`UPDATE ceremony SET nominations_on = $1 WHERE id = 1`, [today]);
  // Roster history is dated three days before the real clock for the same
  // reason: the server closes an interval at its own now(), which must not
  // fall before the interval opened.
  const historyStart = Date.now() - 3 * 24 * 60 * 60_000;
  const historyAt = (n: number) => new Date(historyStart + n * 60_000).toISOString();
  const third = await one<{ id: number }>(
    pool,
    `INSERT INTO league (code, name, max_members, roster_size, is_public, created_by_user_id, created_at)
     VALUES ('late-show-society', 'Late Show Society', 12, 6, FALSE, $1, $2) RETURNING id::int`,
    [userIds.blake, minutes(312)]
  );
  for (const [i, key] of (["blake", "drew"] as PersonaKey[]).entries()) {
    await pool.query(
      `INSERT INTO league_member (league_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, $4)`,
      [third.id, userIds[key], key === "blake" ? "OWNER" : "MEMBER", minutes(360 + i)]
    );
  }

  // Contenders: seeded films and people get TMDB ids, so a pick of one of them
  // resolves to its existing selection without calling TMDB.
  const films = (
    await pool.query<{ id: number }>(`SELECT id::int FROM film ORDER BY id LIMIT 7`)
  ).rows;
  const people = (
    await pool.query<{ id: number }>(`SELECT id::int FROM person ORDER BY id LIMIT 2`)
  ).rows;
  for (const [i, f] of films.entries()) {
    await pool.query(`UPDATE film SET tmdb_id = $1 WHERE id = $2`, [910001 + i, f.id]);
  }
  for (const [i, p] of people.entries()) {
    await pool.query(`UPDATE person SET tmdb_id = $1 WHERE id = $2`, [920001 + i, p.id]);
  }
  const categoryId = async (code: string) =>
    (
      await one<{ id: number }>(
        pool,
        `SELECT id::int FROM circuit_category WHERE circuit_id = $1 AND code = $2`,
        [circuit.id, code]
      )
    ).id;
  const addSelection = async (code: string, film: number, person: number | null) =>
    (
      await one<{ id: number }>(
        pool,
        `INSERT INTO circuit_selection
           (circuit_category_id, film_tmdb_id, person_tmdb_id, film_id, person_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::int`,
        [
          await categoryId(code),
          910001 + film,
          person === null ? null : 920001 + person,
          films[film]!.id,
          person === null ? null : people[person]!.id,
          minutes(500)
        ]
      )
    ).id;
  const sel = {
    picture: [
      await addSelection("best-picture", 0, null),
      await addSelection("best-picture", 1, null),
      await addSelection("best-picture", 2, null),
      await addSelection("best-picture", 3, null),
      await addSelection("best-picture", 4, null)
    ],
    director: [
      await addSelection("best-director", 5, null),
      await addSelection("best-director", 6, null)
    ],
    actress: [
      await addSelection("best-actress", 0, 0),
      await addSelection("best-actress", 1, 1)
    ]
  };

  // casey's draft queue in the main league's season, for the draft lobby:
  // an acting pick on top, then two films.
  for (const [i, selectionId] of [
    sel.actress[0]!,
    sel.picture[0]!,
    sel.director[0]!
  ].entries()) {
    await pool.query(
      `INSERT INTO circuit_queue_item (member_id, selection_id, position, created_at)
       SELECT id, $3, $4, $5 FROM circuit_league_member
       WHERE circuit_league_id = $1 AND user_id = $2`,
      [circuitLeague.id, userIds.casey, selectionId, i + 1, minutes(505)]
    );
  }

  // History is written as the ownership service would write it: one
  // transaction per change, each boundary pointing at its transaction.
  const inSeasonLeague = async (input: {
    leagueId: number;
    rosterSize: number;
    eventCodes: string[];
    members: PersonaKey[];
    at: number;
  }) => {
    const row = await one<{ id: number }>(
      pool,
      `INSERT INTO circuit_league
         (circuit_id, league_id, created_by_user_id, created_at, status, initialized_at, roster_size)
       VALUES ($1, $2, $3, $4, 'IN_SEASON', $4, $5) RETURNING id::int`,
      [
        circuit.id,
        input.leagueId,
        userIds[input.members[0]!],
        historyAt(input.at),
        input.rosterSize
      ]
    );
    await pool.query(
      `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id)
       SELECT $1, circuit_id, id FROM circuit_event WHERE circuit_id = $2 AND code = ANY($3)`,
      [row.id, circuit.id, input.eventCodes]
    );
    await pool.query(
      `INSERT INTO circuit_league_category (circuit_league_id, circuit_id, circuit_category_id, max_owned)
       SELECT $1, circuit_id, id, CASE WHEN kind = 'ACTING' THEN 1 END
       FROM circuit_category WHERE circuit_id = $2`,
      [row.id, circuit.id]
    );
    const memberIds = {} as Record<PersonaKey, number>;
    for (const [i, key] of input.members.entries()) {
      memberIds[key] = (
        await one<{ id: number }>(
          pool,
          `INSERT INTO circuit_league_member (circuit_league_id, user_id, joined_at)
           VALUES ($1, $2, $3) RETURNING id::int`,
          [row.id, userIds[key], historyAt(input.at + 1 + i)]
        )
      ).id;
    }
    // The draft is over: seats in member order, and each DRAFT transaction
    // below points at its own pick, as the draft service writes them.
    const draft = await one<{ id: number }>(
      pool,
      `INSERT INTO circuit_draft
         (circuit_league_id, status, rounds, version, started_at, completed_at, created_at)
       VALUES ($1, 'COMPLETED', $2, 0, $3, $3, $3) RETURNING id::int`,
      [row.id, input.rosterSize, historyAt(input.at + 10)]
    );
    const seatOf = {} as Record<PersonaKey, number>;
    for (const [i, key] of input.members.entries()) {
      seatOf[key] = i + 1;
      await pool.query(
        `INSERT INTO circuit_draft_seat (draft_id, circuit_league_id, seat_number, member_id)
         VALUES ($1, $2, $3, $4)`,
        [draft.id, row.id, i + 1, memberIds[key]]
      );
    }
    let step = 0;
    let pickNumber = 0;
    const record = async (
      key: PersonaKey,
      kind: "DRAFT" | "FREE_AGENT" | "DROP" | "WAIVER",
      add: number | null,
      drop: number | null,
      claimId: number | null = null
    ) => {
      step += 1;
      const at = historyAt(input.at + 10 + step);
      let draftPickId: number | null = null;
      if (kind === "DRAFT") {
        pickNumber += 1;
        draftPickId = (
          await one<{ id: number }>(
            pool,
            `INSERT INTO circuit_draft_pick
               (draft_id, pick_number, original_pick_number, seat_number, member_id,
                outcome, selection_id, source, request_id, actor_user_id, made_at)
             VALUES ($1, $2, $2, $3, $4, 'PICKED', $5, 'MANUAL', $6, $7, $8)
             RETURNING id::int`,
            [
              draft.id,
              pickNumber,
              seatOf[key],
              memberIds[key],
              add,
              `seed-${pickNumber}`,
              userIds[key],
              at
            ]
          )
        ).id;
      }
      const tx = await one<{ id: number }>(
        pool,
        `INSERT INTO circuit_transaction
           (circuit_league_id, member_id, kind, add_selection_id, drop_selection_id,
            draft_pick_id, claim_id, occurred_at, actor_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::int`,
        [row.id, memberIds[key], kind, add, drop, draftPickId, claimId, at, userIds[key]]
      );
      if (drop !== null) {
        await pool.query(
          `UPDATE circuit_ownership SET released_at = $1, released_transaction_id = $2
           WHERE circuit_league_id = $3 AND selection_id = $4 AND released_at IS NULL`,
          [at, tx.id, row.id, drop]
        );
      }
      if (add !== null) {
        await pool.query(
          `INSERT INTO circuit_ownership
             (circuit_league_id, member_id, selection_id, acquired_at, acquired_transaction_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.id, memberIds[key], add, at, tx.id]
        );
      }
    };
    // Rolling priority as the draft's completion sets it: last seat first.
    for (const [i, key] of input.members.entries()) {
      await pool.query(
        `UPDATE circuit_league_member SET waiver_priority = $1 WHERE id = $2`,
        [input.members.length - i, memberIds[key]]
      );
    }
    return { id: row.id, memberIds, record };
  };

  // avery stays out, so the Home baseline lists only Seasons. casey fills the
  // roster (3 of 3); jo drops a pick and adds a free agent.
  const openLeague = await inSeasonLeague({
    leagueId: second.id,
    rosterSize: 3,
    eventCodes: ["golden-reel"],
    members: ["casey", "jo"],
    at: 520
  });
  await openLeague.record("casey", "DRAFT", sel.picture[0]!, null);
  await openLeague.record("jo", "DRAFT", sel.picture[1]!, null);
  await openLeague.record("jo", "DRAFT", sel.picture[2]!, null);
  await openLeague.record("casey", "DRAFT", sel.director[0]!, null);
  await openLeague.record("jo", "DRAFT", sel.actress[1]!, null);
  await openLeague.record("casey", "DRAFT", sel.actress[0]!, null);
  await openLeague.record("jo", "DROP", null, sel.picture[2]!);
  await openLeague.record("jo", "FREE_AGENT", sel.picture[3]!, null);
  // One processed window, for the waiver results: jo (first in priority) wins
  // a claim with a drop, and casey's claim for the same contender loses. The
  // run rotates jo to the back of the priority list.
  const runAt = historyAt(539);
  const priorityBefore = [
    { member_id: openLeague.memberIds.jo, waiver_priority: 1 },
    { member_id: openLeague.memberIds.casey, waiver_priority: 2 }
  ];
  const priorityAfter = [
    { member_id: openLeague.memberIds.casey, waiver_priority: 1 },
    { member_id: openLeague.memberIds.jo, waiver_priority: 2 }
  ];
  const run = await one<{ id: number }>(
    pool,
    `INSERT INTO circuit_waiver_run
       (circuit_league_id, window_starts_on, window_ends_on, status, started_at,
        completed_at, priority_before, priority_after)
     VALUES ($1, $2::date, $2::date, 'COMPLETED', $3, $3, $4::jsonb, $5::jsonb)
     RETURNING id::int`,
    [
      openLeague.id,
      runAt.slice(0, 10),
      runAt,
      JSON.stringify(priorityBefore),
      JSON.stringify(priorityAfter)
    ]
  );
  const claimIds = {} as Record<PersonaKey, number>;
  for (const claim of [
    { key: "jo", drop: sel.picture[1]!, status: "WON", reason: null },
    { key: "casey", drop: sel.director[0]!, status: "LOST", reason: "SELECTION_OWNED" }
  ] as const) {
    claimIds[claim.key] = (
      await one<{ id: number }>(
        pool,
        `INSERT INTO circuit_waiver_claim
           (circuit_league_id, member_id, window_starts_on, selection_id, drop_selection_id,
            rank, status, failure_reason, run_id, created_at, updated_at)
         VALUES ($1, $2, $3::date, $4, $5, 1, $6, $7, $8, $9, $9) RETURNING id::int`,
        [
          openLeague.id,
          openLeague.memberIds[claim.key],
          runAt.slice(0, 10),
          sel.picture[4]!,
          claim.drop,
          claim.status,
          claim.reason,
          run.id,
          historyAt(535)
        ]
      )
    ).id;
  }
  await openLeague.record("jo", "WAIVER", sel.picture[4]!, sel.picture[1]!, claimIds.jo);
  // One statement, so the deferred unique check sees the finished swap.
  await pool.query(
    `UPDATE circuit_league_member m SET waiver_priority = p.waiver_priority
     FROM jsonb_to_recordset($1::jsonb) AS p(member_id int, waiver_priority int)
     WHERE m.id = p.member_id`,
    [JSON.stringify(priorityAfter)]
  );
  // casey's queue and staged contenders here, for the live draft room cells
  // (which rewind the draft to pick 4): undrafted and drafted rows in each.
  for (const [i, selectionId] of [
    sel.director[0]!,
    sel.actress[0]!,
    sel.picture[0]!
  ].entries()) {
    await pool.query(
      `INSERT INTO circuit_queue_item (member_id, selection_id, position, created_at)
       SELECT id, $3, $4, $5 FROM circuit_league_member
       WHERE circuit_league_id = $1 AND user_id = $2`,
      [openLeague.id, userIds.casey, selectionId, i + 1, minutes(530)]
    );
  }
  for (const [i, selectionId] of [sel.picture[3]!, sel.picture[1]!].entries()) {
    await pool.query(
      `INSERT INTO circuit_staged_item (member_id, selection_id, created_at)
       SELECT id, $3, $4 FROM circuit_league_member
       WHERE circuit_league_id = $1 AND user_id = $2`,
      [openLeague.id, userIds.casey, selectionId, minutes(531 + i)]
    );
  }

  const windowLeague = await inSeasonLeague({
    leagueId: third.id,
    rosterSize: 3,
    eventCodes: ["golden-reel", "guild-awards"],
    members: ["blake", "drew"],
    at: 540
  });
  await windowLeague.record("blake", "DRAFT", sel.picture[0]!, null);
  await windowLeague.record("drew", "DRAFT", sel.picture[1]!, null);
  // blake's private claims in today's window: a chipped first choice, then a
  // claim with a conditional drop.
  const blakeChip = await one<{ id: number }>(
    pool,
    `INSERT INTO circuit_chip (circuit_league_id, member_id, original_pick_number, created_at)
     VALUES ($1, $2, 3, $3) RETURNING id::int`,
    [windowLeague.id, windowLeague.memberIds.blake, historyAt(560)]
  );
  // A second pass blake has not put on a claim: the season page's Waivers tile
  // and the waivers page's Your claims tell him he holds it.
  await pool.query(
    `INSERT INTO circuit_chip (circuit_league_id, member_id, original_pick_number, created_at)
     VALUES ($1, $2, 5, $3)`,
    [windowLeague.id, windowLeague.memberIds.blake, historyAt(560)]
  );
  for (const [i, claim] of [
    { selection: sel.picture[2]!, drop: null, chip: blakeChip.id },
    { selection: sel.actress[0]!, drop: sel.picture[0]!, chip: null }
  ].entries()) {
    await pool.query(
      `INSERT INTO circuit_waiver_claim
         (circuit_league_id, member_id, window_starts_on, selection_id, drop_selection_id,
          chip_id, rank, created_at, updated_at)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $8)`,
      [
        windowLeague.id,
        windowLeague.memberIds.blake,
        today,
        claim.selection,
        claim.drop,
        claim.chip,
        i + 1,
        historyAt(561 + i)
      ]
    );
  }

  // A finished season in drew's league (both events), with the scoring ledger
  // written as the rebuild writes it: one row per (member, selection,
  // ceremony, kind), pointing at the interval that held it. jo's third pick is
  // nominated at the Guild Awards, then jo drops it and long adds it before
  // the win, so the nomination stays on jo's side and the win goes to long.
  const fourth = await one<{ id: number }>(
    pool,
    `INSERT INTO league (code, name, max_members, roster_size, is_public, created_by_user_id, created_at)
     VALUES ('golden-hour-guild', 'Golden Hour Guild', 12, 6, FALSE, $1, $2) RETURNING id::int`,
    [userIds.drew, minutes(314)]
  );
  for (const [i, key] of (["drew", "jo", "long"] as PersonaKey[]).entries()) {
    await pool.query(
      `INSERT INTO league_member (league_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, $4)`,
      [fourth.id, userIds[key], key === "drew" ? "OWNER" : "MEMBER", minutes(370 + i)]
    );
  }
  const finishedLeague = await inSeasonLeague({
    leagueId: fourth.id,
    rosterSize: 3,
    eventCodes: ["golden-reel", "guild-awards"],
    members: ["drew", "jo", "long"],
    at: 600
  });
  for (const [key, selectionId] of [
    ["drew", sel.picture[0]!],
    ["jo", sel.picture[1]!],
    ["long", sel.picture[3]!],
    ["long", sel.director[1]!],
    ["jo", sel.actress[1]!],
    ["drew", sel.director[0]!],
    ["drew", sel.actress[0]!],
    ["jo", sel.picture[2]!],
    ["long", sel.picture[4]!]
  ] as const) {
    await finishedLeague.record(key, "DRAFT", selectionId, null);
  }
  await finishedLeague.record("jo", "DROP", null, sel.picture[2]!);
  await finishedLeague.record("long", "FREE_AGENT", sel.picture[2]!, sel.picture[4]!);
  const score = async (
    key: PersonaKey,
    selectionId: number,
    ceremonyId: number,
    kind: "NOMINATION" | "WIN",
    occasionDate: string
  ) => {
    const ownership = await one<{ id: number }>(
      pool,
      `SELECT id::int FROM circuit_ownership
       WHERE circuit_league_id = $1 AND member_id = $2 AND selection_id = $3
       ORDER BY acquired_at DESC LIMIT 1`,
      [finishedLeague.id, finishedLeague.memberIds[key], selectionId]
    );
    await pool.query(
      `INSERT INTO circuit_score_entry
         (circuit_league_id, member_id, selection_id, ceremony_id, kind, occasion_date,
          points, ownership_id)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)`,
      [
        finishedLeague.id,
        finishedLeague.memberIds[key],
        selectionId,
        ceremonyId,
        kind,
        occasionDate,
        kind === "WIN" ? 2 : 1,
        ownership.id
      ]
    );
  };
  // Guild Awards (ceremony 1, winners entered): drew 5, jo 5, long 3.
  for (const [key, selectionId] of [
    ["drew", sel.picture[0]!],
    ["drew", sel.director[0]!],
    ["drew", sel.actress[0]!],
    ["jo", sel.picture[1]!],
    ["jo", sel.picture[2]!],
    ["jo", sel.actress[1]!],
    ["long", sel.picture[3]!]
  ] as const) {
    await score(key, selectionId, 1, "NOMINATION", "2034-01-23");
  }
  for (const [key, selectionId] of [
    ["drew", sel.director[0]!],
    ["jo", sel.actress[1]!],
    ["long", sel.picture[2]!]
  ] as const) {
    await score(key, selectionId, 1, "WIN", "2034-03-05");
  }
  // Golden Reel Awards (ceremony 2): drew 4, jo 1, long 4.
  for (const [key, selectionId] of [
    ["drew", sel.picture[0]!],
    ["drew", sel.actress[0]!],
    ["jo", sel.picture[1]!],
    ["long", sel.picture[2]!],
    ["long", sel.director[1]!]
  ] as const) {
    await score(key, selectionId, 2, "NOMINATION", "2035-01-22");
  }
  for (const [key, selectionId] of [
    ["drew", sel.picture[0]!],
    ["long", sel.director[1]!]
  ] as const) {
    await score(key, selectionId, 2, "WIN", "2035-03-04");
  }
  await pool.query(`UPDATE circuit_league SET status = 'COMPLETE' WHERE id = $1`, [
    finishedLeague.id
  ]);

  // A saved draft plan for the commissioner, in the live ceremony.
  const plan = await one<{ id: number }>(
    pool,
    `INSERT INTO draft_plan (user_id, ceremony_id, name, name_normalized, created_at, updated_at)
     VALUES ($1, 2, 'My shortlist', 'my shortlist', $2, $2) RETURNING id::int`,
    [userIds.avery, minutes(450)]
  );
  const planNominations = seededShuffle(
    Array.from({ length: perCeremony }, (_, i) => perCeremony + 1 + i),
    7
  ).slice(0, 14);
  for (const [i, nominationId] of planNominations.entries()) {
    await pool.query(
      `INSERT INTO draft_plan_item (plan_id, nomination_id, sort_index) VALUES ($1, $2, $3)`,
      [plan.id, nominationId, i]
    );
  }

  // Sessions are created at login time, so every persona signs in last.
  const tokens = {} as Record<PersonaKey, string>;
  for (const key of Object.keys(PERSONAS) as PersonaKey[]) {
    tokens[key] = await login(PERSONAS[key].username);
  }

  return {
    tokens,
    ceremonies: { completed: 1, upcoming: 2, draft: 3 },
    leagues: { main: main.id, second: second.id, third: third.id, fourth: fourth.id },
    seasons: {
      completed: completed.seasonId,
      live: live.seasonId,
      pending: pending.seasonId
    },
    circuitLeagues: {
      main: circuitLeague.id,
      inSeason: openLeague.id,
      inWindow: windowLeague.id,
      complete: finishedLeague.id
    },
    matineeLeague: matinee.id,
    drafts: {
      completed: completed.draftId,
      live: live.draftId,
      pending: pending.draftId
    },
    missingId: 99999
  };
}
