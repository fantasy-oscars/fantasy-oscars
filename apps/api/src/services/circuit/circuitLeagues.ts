import type { Pool } from "pg";
import { type DbClient, runInTransaction } from "../../data/db.js";
import {
  countCircuitLeagueMembers,
  deleteCircuitLeagueMember,
  getCircuitLeagueById,
  insertCircuitLeague,
  insertCircuitLeagueMember,
  listCircuitLeagueCategories,
  listCircuitLeagueEvents,
  listCircuitLeagueMembers,
  listCircuitLeaguesForLeague,
  markCircuitLeagueInitialized,
  replaceCircuitLeagueEvents,
  updateCircuitLeagueSettings,
  upsertCircuitLeagueCategories,
  type CircuitLeagueRow,
  type CircuitLeagueSettingsPatch
} from "../../data/repositories/circuitLeagueRepository.js";
import {
  getCircuitById,
  listCircuitCategories,
  listCircuitCeremonies,
  listCircuitEvents
} from "../../data/repositories/circuitRepository.js";
import {
  getLeagueById,
  getLeagueMember,
  type LeagueRecord
} from "../../data/repositories/leagueRepository.js";
import { resultsDateOf } from "../../domain/circuit.js";
import {
  CIRCUIT_LEAGUE_DEFAULTS,
  assertCircuitLeagueOpen,
  assertCircuitLeagueSettingsEditable,
  assertIdsInCircuit,
  type CircuitLeagueSettingKey
} from "../../domain/circuitLeague.js";
import { AppError } from "../../errors.js";

/*
 * Circuit competitions inside a league (ADR 0005, section 4). Players see a
 * Circuit as a Season, so player-facing messages say "season".
 *
 * Every write that adds or removes a member or changes enabled events goes
 * through lockOpenCircuitLeague, which locks the league row and calls the one
 * guard, assertCircuitLeagueOpen. Initialisation takes the same lock, so a
 * join can never land after it.
 */

export type Viewer = { userId: number; isSuperAdmin: boolean };

const NOT_FOUND = () => new AppError("NOT_FOUND", 404, "Season not found");

function isCommissioner(
  league: LeagueRecord,
  member: { role: string } | null,
  userId: number
) {
  return (
    league.created_by_user_id === userId ||
    member?.role === "OWNER" ||
    member?.role === "CO_OWNER"
  );
}

/** A league a viewer may see: a member of it, or a super admin. */
async function requireVisibleLeague(client: DbClient, leagueId: number, viewer: Viewer) {
  const league = await getLeagueById(client, leagueId);
  if (!league || league.is_public_season) {
    throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
  }
  const member = await getLeagueMember(client, leagueId, viewer.userId);
  if (!member && !viewer.isSuperAdmin) {
    throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
  }
  return { league, member };
}

function requireCommissioner(
  league: LeagueRecord,
  member: { role: string } | null,
  userId: number
) {
  if (!isCommissioner(league, member, userId)) {
    throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
  }
}

/** The Circuit league and its league, for a viewer who may see them. */
export async function requireVisibleCircuitLeague(
  client: DbClient,
  id: number,
  viewer: Viewer,
  opts: { forUpdate?: boolean } = {}
) {
  const circuitLeague = await getCircuitLeagueById(client, id, opts);
  if (!circuitLeague) throw NOT_FOUND();
  const league = await getLeagueById(client, circuitLeague.league_id);
  if (!league) throw NOT_FOUND();
  const member = await getLeagueMember(client, league.id, viewer.userId);
  if (!member && !viewer.isSuperAdmin) throw NOT_FOUND();
  return { circuitLeague, league, member };
}

/**
 * Locks the league row for the rest of the transaction and refuses it once
 * membership and enabled events are frozen. The only way member and event
 * writes reach the repository.
 */
async function lockOpenCircuitLeague(tx: DbClient, id: number, viewer: Viewer) {
  const found = await requireVisibleCircuitLeague(tx, id, viewer, { forUpdate: true });
  assertCircuitLeagueOpen(found.circuitLeague);
  return found;
}

async function addMember(tx: DbClient, league: CircuitLeagueRow, userId: number) {
  assertCircuitLeagueOpen(league);
  await insertCircuitLeagueMember(tx, league.id, userId);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function publicCircuitLeague(row: CircuitLeagueRow) {
  return {
    id: row.id,
    circuit_id: row.circuit_id,
    league_id: row.league_id,
    status: row.status,
    roster_size: row.roster_size,
    draft_type: row.draft_type,
    pick_timer_seconds: row.pick_timer_seconds,
    auto_draft_enabled: row.auto_draft_enabled,
    nomination_points: row.nomination_points,
    win_bonus_points: row.win_bonus_points,
    initialized_at: row.initialized_at,
    created_at: row.created_at
  };
}

export async function listCircuitLeaguesInLeague(
  client: DbClient,
  leagueId: number,
  viewer: Viewer
) {
  await requireVisibleLeague(client, leagueId, viewer);
  const rows = await listCircuitLeaguesForLeague(client, leagueId, viewer.userId);
  return {
    circuit_leagues: rows.map((row) => ({
      ...publicCircuitLeague(row),
      circuit_code: row.circuit_code,
      circuit_name: row.circuit_name,
      circuit_status: row.circuit_status,
      member_count: row.member_count,
      is_member: row.is_member
    }))
  };
}

/**
 * The league with every event and category of its Circuit: events carry
 * `enabled` and their weight, categories their weight and limit (a category
 * added to the Circuit later reads as the defaults).
 */
export async function getCircuitLeagueDetail(
  client: DbClient,
  id: number,
  viewer: Viewer
) {
  const { circuitLeague, league, member } = await requireVisibleCircuitLeague(
    client,
    id,
    viewer
  );
  const circuitId = circuitLeague.circuit_id;
  const [circuit, events, ceremonies, categories, eventSettings, categorySettings] =
    await Promise.all([
      getCircuitById(client, circuitId),
      listCircuitEvents(client, circuitId),
      listCircuitCeremonies(client, circuitId, { publicOnly: true }),
      listCircuitCategories(client, circuitId),
      listCircuitLeagueEvents(client, id),
      listCircuitLeagueCategories(client, id)
    ]);
  const members = await listCircuitLeagueMembers(client, id);
  const enabled = new Map(eventSettings.map((e) => [e.circuit_event_id, e.weight]));
  const categoryById = new Map(categorySettings.map((c) => [c.circuit_category_id, c]));

  return {
    circuit_league: publicCircuitLeague(circuitLeague),
    circuit: circuit && {
      id: circuit.id,
      code: circuit.code,
      name: circuit.name,
      status: circuit.status
    },
    league: { id: league.id, code: league.code, name: league.name },
    events: events.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      is_group: e.is_group,
      sort_index: e.sort_index,
      enabled: enabled.has(e.id),
      weight: enabled.get(e.id) ?? CIRCUIT_LEAGUE_DEFAULTS.event_weight,
      ceremonies: ceremonies
        .filter((c) => c.circuit_event_id === e.id)
        .map((c) => ({
          id: c.ceremony_id,
          code: c.ceremony_code,
          name: c.ceremony_name,
          nominations_on: c.nominations_on,
          results_on: resultsDateOf(c.starts_at)
        }))
    })),
    categories: categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      kind: c.kind,
      sort_index: c.sort_index,
      icon_code: c.icon_code,
      icon_variant: c.icon_variant,
      weight: categoryById.get(c.id)?.weight ?? CIRCUIT_LEAGUE_DEFAULTS.category_weight,
      max_owned: categoryById.get(c.id)?.max_owned ?? CIRCUIT_LEAGUE_DEFAULTS.max_owned
    })),
    members: members.map((m) => ({
      user_id: m.user_id,
      username: m.username,
      avatar_key: m.avatar_key,
      joined_at: m.joined_at
    })),
    viewer: {
      is_league_member: member !== null,
      is_member: members.some((m) => m.user_id === viewer.userId),
      can_manage: isCommissioner(league, member, viewer.userId)
    }
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Starts a Circuit competition in a league, with the defaults, and makes its
 * creator the first member. League owners and co-owners only.
 */
export async function createCircuitLeague(
  pool: Pool,
  input: { leagueId: number; circuitId: number; viewer: Viewer }
) {
  const id = await runInTransaction(pool, async (tx) => {
    const { league, member } = await requireVisibleLeague(
      tx,
      input.leagueId,
      input.viewer
    );
    requireCommissioner(league, member, input.viewer.userId);

    const circuit = await getCircuitById(tx, input.circuitId);
    if (!circuit || circuit.status === "DRAFT") throw NOT_FOUND();
    if (circuit.status === "ARCHIVED") {
      throw new AppError("CIRCUIT_ARCHIVED", 409, "This season has finished");
    }

    const created = await insertCircuitLeague(tx, {
      circuit_id: circuit.id,
      league_id: league.id,
      created_by_user_id: input.viewer.userId
    });
    if (!created) {
      throw new AppError(
        "CIRCUIT_LEAGUE_EXISTS",
        409,
        "This league already plays this season"
      );
    }
    if (member) await addMember(tx, created, input.viewer.userId);
    return created.id;
  });
  return getCircuitLeagueDetail(pool, id, input.viewer);
}

/**
 * Edits the league's own settings. Owner question 11: everything in SETUP;
 * only the pick clock and auto-draft once initialised; nothing after that.
 */
export async function updateCircuitLeagueSettingsFor(
  pool: Pool,
  id: number,
  viewer: Viewer,
  patch: CircuitLeagueSettingsPatch
) {
  await runInTransaction(pool, async (tx) => {
    const { circuitLeague, league, member } = await requireVisibleCircuitLeague(
      tx,
      id,
      viewer,
      { forUpdate: true }
    );
    requireCommissioner(league, member, viewer.userId);
    const keys = Object.keys(patch).filter(
      (key) => patch[key as keyof CircuitLeagueSettingsPatch] !== undefined
    ) as CircuitLeagueSettingKey[];
    assertCircuitLeagueSettingsEditable(circuitLeague, keys);
    await updateCircuitLeagueSettings(tx, id, patch);
  });
  return getCircuitLeagueDetail(pool, id, viewer);
}

/** Replaces the enabled events (any subset, including none) and their weights. */
export async function setCircuitLeagueEvents(
  pool: Pool,
  id: number,
  viewer: Viewer,
  events: ReadonlyArray<{ circuit_event_id: number; weight: number }>
) {
  await runInTransaction(pool, async (tx) => {
    const { circuitLeague, league, member } = await lockOpenCircuitLeague(tx, id, viewer);
    requireCommissioner(league, member, viewer.userId);
    const known = await listCircuitEvents(tx, circuitLeague.circuit_id);
    assertIdsInCircuit(
      events.map((e) => e.circuit_event_id),
      known.map((e) => e.id),
      "Choose events in this season",
      "events"
    );
    await replaceCircuitLeagueEvents(tx, circuitLeague, events);
  });
  return getCircuitLeagueDetail(pool, id, viewer);
}

/** Sets the weight and limit of each listed category; frozen at initialisation. */
export async function setCircuitLeagueCategories(
  pool: Pool,
  id: number,
  viewer: Viewer,
  categories: ReadonlyArray<{
    circuit_category_id: number;
    weight: number;
    max_owned: number | null;
  }>
) {
  await runInTransaction(pool, async (tx) => {
    const { circuitLeague, league, member } = await requireVisibleCircuitLeague(
      tx,
      id,
      viewer,
      { forUpdate: true }
    );
    requireCommissioner(league, member, viewer.userId);
    assertCircuitLeagueSettingsEditable(circuitLeague, ["category_settings"]);
    const known = await listCircuitCategories(tx, circuitLeague.circuit_id);
    assertIdsInCircuit(
      categories.map((c) => c.circuit_category_id),
      known.map((c) => c.id),
      "Choose categories in this season",
      "categories"
    );
    await upsertCircuitLeagueCategories(tx, circuitLeague, categories);
  });
  return getCircuitLeagueDetail(pool, id, viewer);
}

/** Joins the competition. League members only, and only before initialisation. */
export async function joinCircuitLeague(pool: Pool, id: number, viewer: Viewer) {
  await runInTransaction(pool, async (tx) => {
    const { circuitLeague, member } = await lockOpenCircuitLeague(tx, id, viewer);
    if (!member) {
      throw new AppError(
        "LEAGUE_MEMBERSHIP_REQUIRED",
        403,
        "Only league members can join this season"
      );
    }
    await addMember(tx, circuitLeague, viewer.userId);
  });
  return getCircuitLeagueDetail(pool, id, viewer);
}

/** Leaves the competition; only before initialisation. */
export async function leaveCircuitLeague(pool: Pool, id: number, viewer: Viewer) {
  await runInTransaction(pool, async (tx) => {
    const { circuitLeague } = await lockOpenCircuitLeague(tx, id, viewer);
    await deleteCircuitLeagueMember(tx, circuitLeague.id, viewer.userId);
  });
  return getCircuitLeagueDetail(pool, id, viewer);
}

/** SETUP → INITIALIZED: freezes membership, events, roster and scoring. */
export async function initializeCircuitLeague(pool: Pool, id: number, viewer: Viewer) {
  await runInTransaction(pool, async (tx) => {
    const { circuitLeague, league, member } = await lockOpenCircuitLeague(tx, id, viewer);
    requireCommissioner(league, member, viewer.userId);
    if ((await countCircuitLeagueMembers(tx, circuitLeague.id)) === 0) {
      throw new AppError(
        "CIRCUIT_LEAGUE_EMPTY",
        409,
        "Someone has to join before the season can start"
      );
    }
    await markCircuitLeagueInitialized(tx, circuitLeague.id);
  });
  return getCircuitLeagueDetail(pool, id, viewer);
}
