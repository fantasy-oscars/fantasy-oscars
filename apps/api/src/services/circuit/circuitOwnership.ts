import type { Pool } from "pg";
import { type DbClient, runInTransaction } from "../../data/db.js";
import {
  listCircuitLeagueCategories,
  listCircuitLeagueEvents,
  listCircuitLeagueMembers,
  type CircuitLeagueRow
} from "../../data/repositories/circuitLeagueRepository.js";
import {
  closeCircuitOwnership,
  findOpenOwnershipOfSelection,
  findSelectionOwner,
  getCategoryMaxOwned,
  getCircuitLeagueMemberByUser,
  getSelectionPlacement,
  insertCircuitOwnership,
  insertCircuitTransaction,
  listCircuitTransactions,
  listOpenOwnershipsForLeague,
  listOpenOwnershipsForMember,
  lockCircuitLeagueMember,
  type CircuitMemberRow,
  type CircuitTransactionRow,
  type OpenOwnershipRow
} from "../../data/repositories/circuitOwnershipRepository.js";
import {
  listCircuitCategories,
  listCircuitCeremonies
} from "../../data/repositories/circuitRepository.js";
import { listScoreEntries } from "../../data/repositories/circuitScoreRepository.js";
import { listCircuitSelectionsByIds } from "../../data/repositories/circuitSelectionRepository.js";
import {
  getCircuitDraftCompletedAt,
  listCircuitWaiverRunStarts,
  listPendingCircuitWaiverClaimStarts
} from "../../data/repositories/circuitWaiverRepository.js";
import { listScoringOccasions } from "../../domain/circuit.js";
import {
  assertAcquisitionFits,
  assertCircuitLeagueInSeason,
  assertHolds,
  assertTransactionShape,
  type CircuitTransactionKind
} from "../../domain/circuitOwnership.js";
import {
  ceremonyOrderOf,
  memberRosterPoints,
  type SelectionPoints
} from "../../domain/circuitPoints.js";
import { dueWaiverWindows, type DueWaiverWindow } from "../../domain/circuitWaivers.js";
import {
  leagueWaiverWindows,
  waiverWindowAt,
  type WaiverWindow
} from "../../domain/waiverWindows.js";
import { AppError } from "../../errors.js";
import { requireVisibleCircuitLeague, type Viewer } from "./circuitLeagues.js";
import {
  toPublicCircuitSelection,
  type PublicCircuitSelection
} from "./circuitSelections.js";

/*
 * Ownership and transactions (ADR 0005, section 7). applyOwnershipChange is
 * the only writer of circuit_ownership and circuit_transaction: the draft
 * (DRAFT, SUPPLEMENTAL), waivers (WAIVER), free agency and drops all call it,
 * so exclusivity, roster capacity and category limits hold on every path.
 */

export type OwnershipChange = {
  kind: CircuitTransactionKind;
  memberId: number;
  addSelectionId: number | null;
  dropSelectionId: number | null;
  draftPickId?: number | null;
  claimId?: number | null;
  /** Null for system actions (auto-draft, waiver processing). */
  actorUserId: number | null;
};

const SELECTION_TAKEN = () =>
  new AppError("CIRCUIT_SELECTION_TAKEN", 409, "Someone else already has that contender");

/**
 * Applies one add, drop, or add with a drop as one transaction row. Call it
 * inside a database transaction (`tx`); it locks the member row first, so a
 * member's acquisitions are serialised and the capacity counts are current.
 * The drop closes before the add opens, both at the transaction's instant.
 */
export async function applyOwnershipChange(
  tx: DbClient,
  league: CircuitLeagueRow,
  change: OwnershipChange
): Promise<CircuitTransactionRow> {
  const draftPickId = change.draftPickId ?? null;
  const claimId = change.claimId ?? null;
  assertTransactionShape({
    kind: change.kind,
    addSelectionId: change.addSelectionId,
    dropSelectionId: change.dropSelectionId,
    draftPickId,
    claimId
  });

  const member = await lockCircuitLeagueMember(tx, league.id, change.memberId);
  if (!member) throw new AppError("NOT_FOUND", 404, "Player not found in this season");
  const held = await listOpenOwnershipsForMember(tx, league.id, member.id);

  const drop =
    change.dropSelectionId === null
      ? null
      : (held.find((h) => h.selection_id === change.dropSelectionId) ?? null);
  if (change.dropSelectionId !== null) assertHolds(held, change.dropSelectionId);

  if (change.addSelectionId !== null) {
    const selection = await getSelectionPlacement(tx, change.addSelectionId);
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
    if (owner) throw SELECTION_TAKEN();
    assertAcquisitionFits({
      held,
      add: { selection_id: selection.id, category_id: selection.category_id },
      dropSelectionId: change.dropSelectionId,
      rosterSize: league.roster_size,
      maxOwned: await getCategoryMaxOwned(tx, league.id, selection.category_id)
    });
  }

  const transaction = await insertCircuitTransaction(tx, {
    circuit_league_id: league.id,
    member_id: member.id,
    kind: change.kind,
    add_selection_id: change.addSelectionId,
    drop_selection_id: change.dropSelectionId,
    draft_pick_id: draftPickId,
    claim_id: claimId,
    actor_user_id: change.actorUserId
  });
  if (drop) await closeCircuitOwnership(tx, drop.id, transaction);
  if (change.addSelectionId !== null) {
    try {
      await insertCircuitOwnership(tx, transaction, change.addSelectionId);
    } catch (err) {
      // Another member's acquisition committed first: the partial unique
      // index lets exactly one open interval exist.
      const pg = err as { code?: string; constraint?: string };
      if (
        pg.code === "23505" &&
        pg.constraint === "circuit_ownership_open_selection_key"
      ) {
        throw SELECTION_TAKEN();
      }
      throw err;
    }
  }
  return transaction;
}

/** The league's waiver windows, from the occasions of its enabled events. */
export async function getCircuitLeagueWaiverWindows(
  client: DbClient,
  league: CircuitLeagueRow
): Promise<WaiverWindow[]> {
  const [ceremonies, events] = await Promise.all([
    listCircuitCeremonies(client, league.circuit_id),
    listCircuitLeagueEvents(client, league.id)
  ]);
  return leagueWaiverWindows(
    listScoringOccasions(ceremonies),
    events.map((e) => e.circuit_event_id)
  );
}

/**
 * The league's windows that have resolved but not yet run, oldest first.
 * Empty before the league's draft completes.
 */
export async function getCircuitLeagueDueWaiverWindows(
  client: DbClient,
  league: CircuitLeagueRow,
  now: Date,
  windows?: readonly WaiverWindow[]
): Promise<DueWaiverWindow[]> {
  const draftCompletedAt = await getCircuitDraftCompletedAt(client, league.id);
  if (!draftCompletedAt) return [];
  return dueWaiverWindows({
    windows: windows ?? (await getCircuitLeagueWaiverWindows(client, league)),
    draftCompletedAt,
    runStarts: new Set(await listCircuitWaiverRunStarts(client, league.id)),
    pendingClaimStarts: await listPendingCircuitWaiverClaimStarts(client, league.id),
    now
  });
}

/**
 * Free agency is open while no waiver window is, and once every resolved
 * window has run, so a free agent cannot jump a claim between a window's
 * resolution instant and its run.
 */
async function freeAgencyAt(client: DbClient, league: CircuitLeagueRow, now: Date) {
  const windows = await getCircuitLeagueWaiverWindows(client, league);
  const window = waiverWindowAt(windows, now);
  if (window) return { open: false, window };
  const due = await getCircuitLeagueDueWaiverWindows(client, league, now, windows);
  return { open: due.length === 0, window: null };
}

async function requireOwnMember(
  client: DbClient,
  league: CircuitLeagueRow,
  viewer: Viewer
) {
  const member = await getCircuitLeagueMemberByUser(client, league.id, viewer.userId);
  if (!member) {
    throw new AppError(
      "CIRCUIT_MEMBERSHIP_REQUIRED",
      403,
      "Join this season to manage a roster"
    );
  }
  return member;
}

/** What every roster of a league shares, read once per request. */
async function loadRosterContext(client: DbClient, league: CircuitLeagueRow, now: Date) {
  const [categories, categorySettings, freeAgency, ceremonies, entries] =
    await Promise.all([
      listCircuitCategories(client, league.circuit_id),
      listCircuitLeagueCategories(client, league.id),
      freeAgencyAt(client, league, now),
      listCircuitCeremonies(client, league.circuit_id),
      listScoreEntries(client, league.id)
    ]);
  return {
    categories,
    maxOwned: new Map(categorySettings.map((c) => [c.circuit_category_id, c.max_owned])),
    freeAgency,
    ceremonyOrder: ceremonyOrderOf(ceremonies),
    ceremonyNames: new Map(ceremonies.map((c) => [c.ceremony_id, c.ceremony_name])),
    entries
  };
}

type RosterContext = Awaited<ReturnType<typeof loadRosterContext>>;

/**
 * One member's roster. Each held entry carries the ledger points it scored
 * for this member; `points_total` is the member's standings total and
 * `dropped_points` the part from selections they no longer hold.
 */
function composeRoster(
  league: CircuitLeagueRow,
  ctx: RosterContext,
  member: CircuitMemberRow,
  held: readonly OpenOwnershipRow[],
  selections: ReadonlyMap<number, PublicCircuitSelection>
) {
  const points = memberRosterPoints(
    ctx.entries,
    member.id,
    held.map((h) => h.selection_id),
    ctx.ceremonyOrder
  );
  const withNames = (p: SelectionPoints) => ({
    total: p.total,
    by_ceremony: p.by_ceremony.map((c) => ({
      ceremony_id: c.ceremony_id,
      ceremony_name: ctx.ceremonyNames.get(c.ceremony_id) ?? null,
      nomination: c.nomination,
      win: c.win
    }))
  });
  return {
    member: { user_id: member.user_id, username: member.username },
    status: league.status,
    roster_size: league.roster_size,
    free_agency: ctx.freeAgency,
    categories: ctx.categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      kind: c.kind,
      max_owned: ctx.maxOwned.get(c.id) ?? null,
      owned: held.filter((h) => h.category_id === c.id).length
    })),
    entries: held.map((h) => ({
      ownership_id: h.id,
      acquired_at: h.acquired_at,
      acquired_transaction_id: h.acquired_transaction_id,
      selection: selections.get(h.selection_id)!,
      points: withNames(points.by_selection.get(h.selection_id)!)
    })),
    points_total: points.points_total,
    dropped_points: points.dropped_points
  };
}

async function publicSelections(client: DbClient, ids: readonly number[]) {
  return new Map(
    (await listCircuitSelectionsByIds(client, [...new Set(ids)])).map((s) => [
      s.id,
      toPublicCircuitSelection(s)
    ])
  );
}

async function rosterOf(
  client: DbClient,
  league: CircuitLeagueRow,
  member: CircuitMemberRow,
  now: Date
) {
  const [held, ctx] = await Promise.all([
    listOpenOwnershipsForMember(client, league.id, member.id),
    loadRosterContext(client, league, now)
  ]);
  const selections = await publicSelections(
    client,
    held.map((h) => h.selection_id)
  );
  return composeRoster(league, ctx, member, held, selections);
}

/** A member's roster; any viewer of the league may read any member's. */
export async function getCircuitRoster(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer,
  userId: number = viewer.userId,
  now: Date = new Date()
) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const member = await getCircuitLeagueMemberByUser(client, circuitLeague.id, userId);
  if (!member) {
    if (userId === viewer.userId) await requireOwnMember(client, circuitLeague, viewer);
    throw new AppError("NOT_FOUND", 404, "Player not found in this season");
  }
  return rosterOf(client, circuitLeague, member, now);
}

/**
 * Every member's roster in the shape of `getCircuitRoster`, in join order,
 * from one read of the league's open intervals and one of its ledger.
 */
export async function getCircuitRosters(
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
  const [members, held, ctx] = await Promise.all([
    listCircuitLeagueMembers(client, circuitLeague.id),
    listOpenOwnershipsForLeague(client, circuitLeague.id),
    loadRosterContext(client, circuitLeague, now)
  ]);
  const selections = await publicSelections(
    client,
    held.map((h) => h.selection_id)
  );
  return {
    rosters: members.map((m) =>
      composeRoster(
        circuitLeague,
        ctx,
        m,
        held.filter((h) => h.member_id === m.id),
        selections
      )
    )
  };
}

/**
 * Who holds a selection in the league now, for the contender picker's
 * preview. Refuses a selection of another Circuit.
 */
export async function getCircuitSelectionOwner(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer,
  selectionId: number
): Promise<{ user_id: number; username: string } | null> {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const placement = await getSelectionPlacement(client, selectionId);
  if (!placement || placement.circuit_id !== circuitLeague.circuit_id) {
    throw new AppError("NOT_FOUND", 404, "That contender isn't in this season");
  }
  return findSelectionOwner(client, circuitLeague.id, selectionId);
}

/** Drops a selection from the viewer's roster at once; allowed in a window too. */
export async function dropCircuitSelection(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  selectionId: number,
  now: Date = new Date()
) {
  const { league, member } = await runInTransaction(pool, async (tx) => {
    const { circuitLeague } = await requireVisibleCircuitLeague(
      tx,
      circuitLeagueId,
      viewer
    );
    assertCircuitLeagueInSeason(circuitLeague);
    const member = await requireOwnMember(tx, circuitLeague, viewer);
    await applyOwnershipChange(tx, circuitLeague, {
      kind: "DROP",
      memberId: member.id,
      addSelectionId: null,
      dropSelectionId: selectionId,
      actorUserId: viewer.userId
    });
    return { league: circuitLeague, member };
  });
  return rosterOf(pool, league, member, now);
}

/**
 * Adds a free agent to the viewer's roster, dropping `dropSelectionId` in the
 * same transaction when given. Refused while a waiver window is open.
 */
export async function addCircuitFreeAgent(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  input: { selectionId: number; dropSelectionId: number | null },
  now: Date = new Date()
) {
  const { league, member } = await runInTransaction(pool, async (tx) => {
    const { circuitLeague } = await requireVisibleCircuitLeague(
      tx,
      circuitLeagueId,
      viewer
    );
    assertCircuitLeagueInSeason(circuitLeague);
    const member = await requireOwnMember(tx, circuitLeague, viewer);
    const freeAgency = await freeAgencyAt(tx, circuitLeague, now);
    if (freeAgency.window) {
      throw new AppError(
        "CIRCUIT_WAIVER_WINDOW_OPEN",
        409,
        "Free agency is closed while waiver claims are open",
        { window: freeAgency.window }
      );
    }
    if (!freeAgency.open) {
      throw new AppError(
        "CIRCUIT_WAIVER_WINDOW_OPEN",
        409,
        "Free agency reopens once the last waiver claims are processed",
        { window: null }
      );
    }
    await applyOwnershipChange(tx, circuitLeague, {
      kind: "FREE_AGENT",
      memberId: member.id,
      addSelectionId: input.selectionId,
      dropSelectionId: input.dropSelectionId,
      actorUserId: viewer.userId
    });
    return { league: circuitLeague, member };
  });
  return rosterOf(pool, league, member, now);
}

/** The league's transaction log, newest first. */
export async function listCircuitLeagueTransactions(
  client: DbClient,
  circuitLeagueId: number,
  viewer: Viewer
) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    client,
    circuitLeagueId,
    viewer
  );
  const rows = await listCircuitTransactions(client, circuitLeague.id);
  const ids = [
    ...new Set(
      rows.flatMap((r) =>
        [r.add_selection_id, r.drop_selection_id].filter(
          (id): id is number => id !== null
        )
      )
    )
  ];
  const selections = new Map(
    (await listCircuitSelectionsByIds(client, ids)).map((s) => [
      s.id,
      toPublicCircuitSelection(s)
    ])
  );
  const pick = (id: number | null) => (id === null ? null : (selections.get(id) ?? null));
  return {
    transactions: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      occurred_at: r.occurred_at,
      member: { user_id: r.user_id, username: r.username },
      add: pick(r.add_selection_id),
      drop: pick(r.drop_selection_id)
    }))
  };
}
