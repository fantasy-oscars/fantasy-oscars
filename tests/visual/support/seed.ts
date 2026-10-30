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
  leagues: { main: number; second: number };
  seasons: { completed: number; live: number; pending: number };
  drafts: { completed: number; live: number };
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
  const ceremonyStatus = ["COMPLETE", "PUBLISHED", "DRAFT"];
  const startsAt = [
    "2034-03-06T01:00:00Z",
    "2035-03-05T01:00:00Z",
    "2036-03-03T01:00:00Z"
  ];
  for (const [i, c] of ceremonyDefs.entries()) {
    await pool.query(
      `INSERT INTO ceremony (id, code, name, year, starts_at, status, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        c.id,
        c.code,
        c.name,
        c.year,
        startsAt[i],
        ceremonyStatus[i],
        ceremonyStatus[i] === "DRAFT" ? null : minutes(100 + i)
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
    leagues: { main: main.id, second: second.id },
    seasons: {
      completed: completed.seasonId,
      live: live.seasonId,
      pending: pending.seasonId
    },
    drafts: { completed: completed.draftId, live: live.draftId },
    missingId: 99999
  };
}
