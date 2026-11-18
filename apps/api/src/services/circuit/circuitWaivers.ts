import type { Pool } from "pg";
import { type DbClient, runInTransaction } from "../../data/db.js";
import type { CircuitLeagueRow } from "../../data/repositories/circuitLeagueRepository.js";
import {
  findOpenOwnershipOfSelection,
  getCircuitLeagueMemberByUser,
  getSelectionPlacement,
  listOpenOwnershipsForMember,
  type CircuitMemberRow
} from "../../data/repositories/circuitOwnershipRepository.js";
import { listCircuitSelectionsByIds } from "../../data/repositories/circuitSelectionRepository.js";
import {
  getCircuitWaiverClaimForMember,
  hasCircuitWaiverRun,
  insertCircuitWaiverClaim,
  listCircuitChipsForMember,
  listCircuitLeagueChips,
  listCircuitWaiverClaimsForMember,
  listCircuitWaiverPriorities,
  listCompletedCircuitWaiverRuns,
  listResolvedCircuitWaiverClaims,
  lockCircuitWaiverClaimant,
  setCircuitWaiverClaimRanks,
  updateCircuitWaiverClaim,
  withdrawCircuitWaiverClaim
} from "../../data/repositories/circuitWaiverRepository.js";
import {
  assertCircuitLeagueInSeason,
  assertHolds
} from "../../domain/circuitOwnership.js";
import {
  editableClaimWindow,
  orderWaiverClaims,
  type WaiverPriority
} from "../../domain/circuitWaivers.js";
import { waiverWindowAt, type WaiverWindow } from "../../domain/waiverWindows.js";
import { AppError } from "../../errors.js";
import { requireVisibleCircuitLeague, type Viewer } from "./circuitLeagues.js";
import { getCircuitLeagueWaiverWindows } from "./circuitOwnership.js";
import { toPublicCircuitSelection } from "./circuitSelections.js";

/*
 * Waiver claims (ADR 0005, section 9). While a waiver window is open, free
 * agency is closed and members file ranked claims instead, each with an
 * optional conditional drop and an optional chip. Claims are private: every
 * route here reads and writes only the viewer's own, and nothing else returns
 * a pending claim. They change until the processor locks the window.
 *
 * Every write share-locks the league row, then locks the claimant's member
 * row. The processor takes the league row FOR UPDATE and records its run
 * before it reads any claim, so a write either commits before the run starts
 * or sees the run and is refused.
 */

const CLAIM_NOT_FOUND = () => new AppError("NOT_FOUND", 404, "That claim isn't yours");

async function requireClaimant(
  client: DbClient,
  league: CircuitLeagueRow,
  viewer: Viewer
): Promise<CircuitMemberRow> {
  const member = await getCircuitLeagueMemberByUser(client, league.id, viewer.userId);
  if (!member) {
    throw new AppError(
      "CIRCUIT_MEMBERSHIP_REQUIRED",
      403,
      "Join this season to make waiver claims"
    );
  }
  return member;
}

async function openWindowAt(client: DbClient, league: CircuitLeagueRow, now: Date) {
  return waiverWindowAt(await getCircuitLeagueWaiverWindows(client, league), now);
}

/** Share-locks the league, then locks the viewer's claims, for a claim write. */
async function lockClaimant(tx: DbClient, circuitLeagueId: number, viewer: Viewer) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    tx,
    circuitLeagueId,
    viewer,
    { forShare: true }
  );
  assertCircuitLeagueInSeason(circuitLeague);
  const member = await requireClaimant(tx, circuitLeague, viewer);
  await lockCircuitWaiverClaimant(tx, member.id);
  return { league: circuitLeague, member };
}

/**
 * The window a claim write goes to: the claim's own for an edit or a
 * withdrawal, or the one open now for a new claim or a reorder. Refused
 * unless that window is open and the processor has not started it.
 */
async function writableWindow(
  tx: DbClient,
  league: CircuitLeagueRow,
  now: Date,
  claimWindowStartsOn: string | null = null
) {
  const openWindow = await openWindowAt(tx, league, now);
  const key = claimWindowStartsOn ?? openWindow?.starts_on ?? null;
  return editableClaimWindow({
    openWindow,
    claimWindowStartsOn,
    runStarted: key !== null && (await hasCircuitWaiverRun(tx, league.id, key))
  });
}

async function requirePendingClaim(
  tx: DbClient,
  member: CircuitMemberRow,
  claimId: number
) {
  const claim = await getCircuitWaiverClaimForMember(tx, member.id, claimId);
  if (!claim || claim.status === "WITHDRAWN") throw CLAIM_NOT_FOUND();
  return claim;
}

/** The conditional drop must be on the claimant's roster when it is set. */
async function checkDrop(
  tx: DbClient,
  league: CircuitLeagueRow,
  member: CircuitMemberRow,
  selectionId: number,
  dropSelectionId: number | null
) {
  if (dropSelectionId === null) return;
  if (dropSelectionId === selectionId) {
    throw new AppError("VALIDATION_ERROR", 400, "Choose a different contender to drop");
  }
  assertHolds(
    await listOpenOwnershipsForMember(tx, league.id, member.id),
    dropSelectionId
  );
}

/** A chip must be the claimant's, available and on no other pending claim. */
async function checkChip(
  tx: DbClient,
  member: CircuitMemberRow,
  chipId: number | null,
  claimId: number | null
) {
  if (chipId === null) return;
  const chip = (await listCircuitChipsForMember(tx, member.id)).find(
    (c) => c.id === chipId
  );
  if (!chip) throw new AppError("NOT_FOUND", 404, "That chip isn't yours");
  if (chip.status !== "AVAILABLE") {
    throw new AppError("CIRCUIT_CHIP_UNAVAILABLE", 409, "That chip has been used up");
  }
  if (chip.claim_id !== null && chip.claim_id !== claimId) {
    throw CHIP_IN_USE();
  }
}

const CHIP_IN_USE = () =>
  new AppError("CIRCUIT_CHIP_IN_USE", 409, "That chip is already on another claim");

/** Maps the claim table's unique keys to the errors a player can act on. */
function claimConflict(err: unknown): never {
  const pg = err as { code?: string; constraint?: string };
  if (pg.code === "23505" && pg.constraint === "circuit_waiver_claim_selection_key") {
    throw new AppError(
      "CIRCUIT_WAIVER_CLAIM_EXISTS",
      409,
      "You already have a claim for that contender"
    );
  }
  if (pg.code === "23505" && pg.constraint === "circuit_waiver_claim_chip_key") {
    throw CHIP_IN_USE();
  }
  throw err;
}

function publicWindow(window: WaiverWindow) {
  return {
    starts_on: window.starts_on,
    ends_on: window.ends_on,
    resolves_on: window.resolves_on
  };
}

/** The viewer's claims in a window, their chips and whether the window is locked. */
async function claimsOf(
  client: DbClient,
  league: CircuitLeagueRow,
  member: CircuitMemberRow,
  window: WaiverWindow | null
) {
  const claims = window
    ? await listCircuitWaiverClaimsForMember(client, member.id, window.starts_on)
    : [];
  const chips = await listCircuitChipsForMember(client, member.id);
  const locked = window
    ? await hasCircuitWaiverRun(client, league.id, window.starts_on)
    : false;
  const selections = new Map(
    (
      await listCircuitSelectionsByIds(
        client,
        claims.flatMap((c) =>
          c.drop_selection_id === null
            ? [c.selection_id]
            : [c.selection_id, c.drop_selection_id]
        )
      )
    ).map((s) => [s.id, toPublicCircuitSelection(s)])
  );
  const chipById = new Map(chips.map((c) => [c.id, c]));
  return {
    window: window && publicWindow(window),
    locked,
    claims: claims.map((c) => {
      const chip = c.chip_id === null ? null : chipById.get(c.chip_id);
      return {
        id: c.id,
        rank: c.rank,
        status: c.status,
        failure_reason: c.failure_reason,
        selection: selections.get(c.selection_id)!,
        drop:
          c.drop_selection_id === null
            ? null
            : (selections.get(c.drop_selection_id) ?? null),
        chip: chip
          ? { id: chip.id, original_pick_number: chip.original_pick_number }
          : null,
        created_at: c.created_at,
        updated_at: c.updated_at
      };
    }),
    chips: chips.map((c) => ({
      id: c.id,
      original_pick_number: c.original_pick_number,
      status: c.status,
      claim_id: c.claim_id
    }))
  };
}

/** The viewer's claims in the window open now, by rank, and their chips. */
export async function getCircuitWaiverClaims(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer,
  now: Date = new Date()
) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const member = await requireClaimant(client, circuitLeague, viewer);
  return claimsOf(
    client,
    circuitLeague,
    member,
    await openWindowAt(client, circuitLeague, now)
  );
}

/**
 * Files a claim in the window open now, at the bottom of the viewer's
 * ranking. The selection must be a free agent of the league's Circuit; the
 * drop, if any, must be on the viewer's roster.
 */
export async function createCircuitWaiverClaim(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  input: { selectionId: number; dropSelectionId: number | null; chipId: number | null },
  now: Date = new Date()
) {
  return runInTransaction(pool, async (tx) => {
    const { league, member } = await lockClaimant(tx, circuitLeagueId, viewer);
    const window = await writableWindow(tx, league, now);
    const selection = await getSelectionPlacement(tx, input.selectionId);
    if (!selection || selection.circuit_id !== league.circuit_id) {
      throw new AppError("NOT_FOUND", 404, "That contender isn't in this season");
    }
    const owner = await findOpenOwnershipOfSelection(tx, league.id, selection.id);
    if (owner?.member_id === member.id) {
      throw new AppError(
        "CIRCUIT_SELECTION_ALREADY_OWNED",
        409,
        "That contender is already on your roster"
      );
    }
    if (owner) {
      throw new AppError(
        "CIRCUIT_SELECTION_TAKEN",
        409,
        "Someone else already has that contender"
      );
    }
    await checkDrop(tx, league, member, selection.id, input.dropSelectionId);
    await checkChip(tx, member, input.chipId, null);
    await insertCircuitWaiverClaim(tx, {
      circuit_league_id: league.id,
      member_id: member.id,
      window_starts_on: window.starts_on,
      selection_id: selection.id,
      drop_selection_id: input.dropSelectionId,
      chip_id: input.chipId
    }).catch(claimConflict);
    return claimsOf(tx, league, member, window);
  });
}

/**
 * Changes a pending claim's conditional drop or chip. An omitted field stays
 * as it is; null clears it.
 */
export async function updateCircuitWaiverClaimFor(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  claimId: number,
  patch: { dropSelectionId?: number | null; chipId?: number | null },
  now: Date = new Date()
) {
  return runInTransaction(pool, async (tx) => {
    const { league, member } = await lockClaimant(tx, circuitLeagueId, viewer);
    const claim = await requirePendingClaim(tx, member, claimId);
    const window = await writableWindow(tx, league, now, claim.window_starts_on);
    const dropSelectionId =
      patch.dropSelectionId === undefined
        ? claim.drop_selection_id
        : patch.dropSelectionId;
    const chipId = patch.chipId === undefined ? claim.chip_id : patch.chipId;
    if (patch.dropSelectionId !== undefined) {
      await checkDrop(tx, league, member, claim.selection_id, dropSelectionId);
    }
    if (patch.chipId !== undefined) await checkChip(tx, member, chipId, claim.id);
    await updateCircuitWaiverClaim(tx, claim.id, {
      drop_selection_id: dropSelectionId,
      chip_id: chipId
    }).catch(claimConflict);
    return claimsOf(tx, league, member, window);
  });
}

/** Withdraws a pending claim and closes the gap in the viewer's ranking. */
export async function withdrawCircuitWaiverClaimFor(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  claimId: number,
  now: Date = new Date()
) {
  return runInTransaction(pool, async (tx) => {
    const { league, member } = await lockClaimant(tx, circuitLeagueId, viewer);
    const claim = await requirePendingClaim(tx, member, claimId);
    const window = await writableWindow(tx, league, now, claim.window_starts_on);
    await withdrawCircuitWaiverClaim(tx, claim.id);
    const pending = (
      await listCircuitWaiverClaimsForMember(tx, member.id, window.starts_on)
    ).filter((c) => c.status === "PENDING");
    await setCircuitWaiverClaimRanks(
      tx,
      member.id,
      pending.map((c) => c.id)
    );
    return claimsOf(tx, league, member, window);
  });
}

/**
 * Ranks the viewer's pending claims in the window open now. `claimIds` must
 * list exactly those claims, so an edit made elsewhere is never lost.
 */
export async function rankCircuitWaiverClaims(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  claimIds: readonly number[],
  now: Date = new Date()
) {
  return runInTransaction(pool, async (tx) => {
    const { league, member } = await lockClaimant(tx, circuitLeagueId, viewer);
    const window = await writableWindow(tx, league, now);
    const current = new Set(
      (await listCircuitWaiverClaimsForMember(tx, member.id, window.starts_on))
        .filter((c) => c.status === "PENDING")
        .map((c) => c.id)
    );
    const sameSet =
      claimIds.length === current.size &&
      new Set(claimIds).size === claimIds.length &&
      claimIds.every((id) => current.has(id));
    if (!sameSet) {
      throw new AppError(
        "CIRCUIT_WAIVER_CLAIMS_CHANGED",
        409,
        "Your claims changed. Reload them and try again."
      );
    }
    await setCircuitWaiverClaimRanks(tx, member.id, claimIds);
    return claimsOf(tx, league, member, window);
  });
}

/**
 * What the whole league sees: the window open now, rolling priority and every
 * chip. No claim appears here.
 */
export async function getCircuitWaivers(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer,
  now: Date = new Date()
) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const [window, priority, chips] = await Promise.all([
    openWindowAt(client, circuitLeague, now),
    listCircuitWaiverPriorities(client, circuitLeague.id),
    listCircuitLeagueChips(client, circuitLeague.id)
  ]);
  return {
    window: window && publicWindow(window),
    priority: priority.map((p) => ({
      user_id: p.user_id,
      username: p.username,
      waiver_priority: p.waiver_priority
    })),
    chips: chips.map((c) => ({
      id: c.id,
      member: { user_id: c.user_id, username: c.username },
      original_pick_number: c.original_pick_number,
      status: c.status
    }))
  };
}

/**
 * What the whole league sees once a window has run: each completed run,
 * newest first, with its won and lost claims in the order the run evaluated
 * them and the priority before and after. Pending claims never appear.
 */
export async function getCircuitWaiverResults(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer
) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const [runs, claims, members] = await Promise.all([
    listCompletedCircuitWaiverRuns(client, circuitLeague.id),
    listResolvedCircuitWaiverClaims(client, circuitLeague.id),
    listCircuitWaiverPriorities(client, circuitLeague.id)
  ]);
  const selections = new Map(
    (
      await listCircuitSelectionsByIds(
        client,
        claims.flatMap((c) =>
          c.drop_selection_id === null
            ? [c.selection_id]
            : [c.selection_id, c.drop_selection_id]
        )
      )
    ).map((s) => [s.id, toPublicCircuitSelection(s)])
  );
  const memberById = new Map(members.map((m) => [m.member_id, m]));
  const publicPriority = (priorities: readonly WaiverPriority[]) =>
    [...priorities]
      .sort((a, b) => a.waiver_priority - b.waiver_priority)
      .flatMap((p) => {
        const member = memberById.get(p.member_id);
        return member
          ? [
              {
                user_id: member.user_id,
                username: member.username,
                waiver_priority: p.waiver_priority
              }
            ]
          : [];
      });
  return {
    runs: runs.map((run) => ({
      id: run.id,
      window: { starts_on: run.window_starts_on, ends_on: run.window_ends_on },
      completed_at: run.completed_at,
      priority_before: publicPriority(run.priority_before),
      priority_after: publicPriority(run.priority_after),
      // A pending claim's chip is always available, so a claim that carried
      // one was ordered by it; the run's starting priority orders the rest.
      claims: orderWaiverClaims(
        claims.filter((c) => c.run_id === run.id),
        run.priority_before
      ).map((c, i) => ({
        id: c.id,
        order: i + 1,
        member: { user_id: c.user_id, username: c.username },
        status: c.status,
        failure_reason: c.failure_reason,
        selection: selections.get(c.selection_id)!,
        drop:
          c.drop_selection_id === null
            ? null
            : (selections.get(c.drop_selection_id) ?? null),
        chip:
          c.chip_pick_number === null
            ? null
            : { original_pick_number: c.chip_pick_number }
      }))
    }))
  };
}
