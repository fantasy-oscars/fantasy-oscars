import type { Pool } from "pg";
import { type DbClient, runInTransaction } from "../../data/db.js";
import {
  appendCircuitDraftEvent,
  completeCircuitDraft,
  getCircuitDraftById,
  getCircuitDraftIdByLeague,
  getNextCircuitDraftDeadlineWaitMs,
  getCircuitDraftPickByRequest,
  insertCircuitChip,
  insertCircuitDraftPick,
  insertCircuitDraftSeats,
  insertStartedCircuitDraft,
  listCircuitChips,
  listCircuitDraftPicks,
  listCircuitDraftSeats,
  listExpiredCircuitDraftIds,
  listMissedRegularCircuitDraftPicks,
  listUnavailableCircuitDraftSelections,
  updateCircuitDraftClock,
  type CircuitChipRow,
  type CircuitDraftEventRow,
  type CircuitDraftPickRow,
  type CircuitDraftRow,
  type CircuitDraftSeatRow
} from "../../data/repositories/circuitDraftRepository.js";
import {
  getCircuitLeagueById,
  listCircuitLeagueCategories,
  listCircuitLeagueMembers,
  moveCircuitLeagueStatus,
  type CircuitLeagueRow
} from "../../data/repositories/circuitLeagueRepository.js";
import {
  getCircuitLeagueMemberByUser,
  listOpenOwnershipsForMember
} from "../../data/repositories/circuitOwnershipRepository.js";
import { listCircuitQueueForAutoPick } from "../../data/repositories/circuitQueueRepository.js";
import { getCircuitById } from "../../data/repositories/circuitRepository.js";
import { setCircuitWaiverPriorities } from "../../data/repositories/circuitWaiverRepository.js";
import {
  assertCircuitDraftPausable,
  assertCircuitDraftResumable,
  assertCircuitDraftStartable,
  assertCircuitDraftTakingPicks,
  assertOnTheClock,
  chooseCircuitAutoPick,
  circuitDraftPickTimer,
  circuitDraftSlot,
  isCircuitDraftPickDue,
  nextCircuitDraftPick,
  resumedCircuitDraftDeadline,
  resumedCircuitDraftStatus,
  shuffleUniformly,
  type CircuitDraftSlot,
  type MissedRegularPick
} from "../../domain/circuitDraft.js";
import { assertCircuitLive } from "../../domain/circuit.js";
import { initialWaiverPriorities } from "../../domain/circuitWaivers.js";
import { computeDeadline } from "../../domain/draftPickRules.js";
import { AppError } from "../../errors.js";
import { emitCircuitDraftEvents } from "./circuitDraftEvents.js";
import { wakeForCircuitDraftDeadline } from "./circuitDraftWake.js";
import { listCircuitSelectionsByIds } from "../../data/repositories/circuitSelectionRepository.js";
import { applyOwnershipChange } from "./circuitOwnership.js";
import { toPublicCircuitSelection } from "./circuitSelections.js";
import {
  requireCommissioner,
  requireVisibleCircuitLeague,
  type Viewer
} from "./circuitLeagues.js";

/*
 * The Circuit draft (ADR 0005, section 6): a live snake draft of selections,
 * separate from the ceremony draft. The league owner starts it once on an
 * initialised league; members then pick in snake order. Every pick writes
 * ownership through applyOwnershipChange as a DRAFT transaction in the same
 * database transaction, so the draft obeys the same exclusivity, capacity and
 * category limits as every other acquisition.
 *
 * When the clock runs out, the draft sweeper calls tickCircuitDraft, which
 * auto-picks from the member's queue only, or records the pick as missed.
 * Missed regular picks get one supplemental round after the regular rounds,
 * in original pick order (owner question 1); a supplemental pick missed again
 * becomes one chip valued at the original pick number.
 *
 * Every pick, auto-pick, pause and resume locks the draft row first, so they
 * are serialised and the clock moves once per pick; whichever arrives second
 * sees the draft as the first left it. Lock order is the draft row, then a
 * member row (ownership and queue writes take only the member row). Each
 * change appends a versioned circuit_draft_event; once the transaction
 * commits, the events go to the league's room in the /circuits namespace.
 * A client rebuilds the board from GET /circuit-drafts/:id/snapshot plus the
 * events after the snapshot's version: each payload carries the draft, the
 * slot on the clock and any new pick, chip or seats, under the snapshot's
 * keys.
 */

const DRAFT_NOT_FOUND = () => new AppError("NOT_FOUND", 404, "Draft not found");

/** The draft without its version, for event payloads (the event carries it). */
function draftState(draft: CircuitDraftRow) {
  return {
    id: draft.id,
    circuit_league_id: draft.circuit_league_id,
    status: draft.status,
    draft_type: draft.draft_type,
    rounds: draft.rounds,
    pick_timer_seconds: draft.pick_timer_seconds,
    current_pick_number: draft.current_pick_number,
    pick_deadline_at: draft.pick_deadline_at,
    started_at: draft.started_at,
    completed_at: draft.completed_at,
    paused_at: draft.paused_at
  };
}

function publicDraft(draft: CircuitDraftRow) {
  return { ...draftState(draft), version: draft.version };
}

function publicSeat(seat: CircuitDraftSeatRow) {
  return {
    seat_number: seat.seat_number,
    member_id: seat.member_id,
    user_id: seat.user_id,
    username: seat.username
  };
}

function publicPick(pick: CircuitDraftPickRow) {
  return {
    id: pick.id,
    pick_number: pick.pick_number,
    original_pick_number: pick.original_pick_number,
    seat_number: pick.seat_number,
    member_id: pick.member_id,
    outcome: pick.outcome,
    selection_id: pick.selection_id,
    source: pick.source,
    request_id: pick.request_id,
    made_at: pick.made_at
  };
}

/** The slot on the clock and the member who holds it; null when none is. */
function publicClock(
  draft: CircuitDraftRow,
  seats: readonly CircuitDraftSeatRow[],
  missed: readonly MissedRegularPick[]
) {
  const slot = circuitDraftSlot({
    seatCount: seats.length,
    rounds: draft.rounds,
    pickNumber: draft.current_pick_number,
    missed
  });
  const seat = slot && seats.find((s) => s.seat_number === slot.seat_number);
  return slot && seat ? { ...slot, member_id: seat.member_id } : null;
}

/** Appends an event and keeps it for emitting once the transaction commits. */
async function recordEvent(
  tx: DbClient,
  events: CircuitDraftEventRow[],
  draftId: number,
  eventType: string,
  payload: unknown
) {
  const event = await appendCircuitDraftEvent(tx, draftId, eventType, payload);
  events.push(event);
  return event;
}

/** After commit: sends the events and tells the sweeper about the new deadline. */
function afterCommit(
  draft: { circuit_league_id: number; pick_deadline_at: Date | null },
  events: readonly CircuitDraftEventRow[]
) {
  emitCircuitDraftEvents(draft.circuit_league_id, events);
  wakeForCircuitDraftDeadline(draft.pick_deadline_at);
}

/** The draft and the league around it, for a viewer who may see the league. */
async function requireVisibleDraft(
  client: DbClient,
  draftId: number,
  viewer: Viewer,
  opts: { forUpdate?: boolean; forShare?: boolean } = {}
) {
  const draft = await getCircuitDraftById(client, draftId, opts);
  if (!draft) throw DRAFT_NOT_FOUND();
  try {
    const found = await requireVisibleCircuitLeague(
      client,
      draft.circuit_league_id,
      viewer
    );
    return { draft, ...found };
  } catch (err) {
    if (err instanceof AppError && err.status === 404) throw DRAFT_NOT_FOUND();
    throw err;
  }
}

/**
 * Starts the league's one draft: seats every member in a uniformly shuffled
 * order, sets rounds to the roster size, puts pick 1 on the clock and moves
 * the league to DRAFTING. `random` is injectable for tests.
 */
export async function startCircuitDraft(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer,
  opts: { random?: () => number; now?: Date } = {}
) {
  const { result, events } = await runInTransaction(pool, async (tx) => {
    const events: CircuitDraftEventRow[] = [];
    const { circuitLeague, league, member } = await requireVisibleCircuitLeague(
      tx,
      circuitLeagueId,
      viewer,
      { forUpdate: true }
    );
    requireCommissioner(league, member, viewer.userId);
    // Seasons can be set up while the Circuit is published; the draft waits
    // until it is live.
    assertCircuitLive((await getCircuitById(tx, circuitLeague.circuit_id))?.status ?? "");
    const members = await listCircuitLeagueMembers(tx, circuitLeague.id);
    assertCircuitDraftStartable(circuitLeague, members.length);

    const pickTimerSeconds = circuitDraftPickTimer(circuitLeague.pick_timer_seconds);
    const draft = await insertStartedCircuitDraft(tx, {
      circuit_league_id: circuitLeague.id,
      draft_type: circuitLeague.draft_type,
      rounds: circuitLeague.roster_size,
      pick_timer_seconds: pickTimerSeconds,
      pick_deadline_at: computeDeadline(opts.now ?? new Date(), pickTimerSeconds)
    });
    await insertCircuitDraftSeats(
      tx,
      draft,
      shuffleUniformly(
        members.map((m) => m.id),
        opts.random
      )
    );
    await moveCircuitLeagueStatus(tx, circuitLeague.id, "INITIALIZED", "DRAFTING");

    const seatRows = await listCircuitDraftSeats(tx, draft.id);
    const seats = seatRows.map(publicSeat);
    const event = await recordEvent(tx, events, draft.id, "draft.started", {
      draft: draftState(draft),
      on_the_clock: publicClock(draft, seatRows, []),
      seats
    });
    return {
      result: { draft: publicDraft({ ...draft, version: event.version }), seats },
      events
    };
  });
  afterCommit(result.draft, events);
  return result;
}

/** The draft row, its seats and its league, read under the draft-row lock. */
type LockedDraft = {
  draft: CircuitDraftRow;
  seats: CircuitDraftSeatRow[];
  league: CircuitLeagueRow;
  /** The slot on the clock and its seat; null when no pick is on the clock. */
  slot: CircuitDraftSlot | null;
  seat: CircuitDraftSeatRow | null;
};

type OnTheClock = LockedDraft & { slot: CircuitDraftSlot; seat: CircuitDraftSeatRow };

function isOnTheClock(locked: LockedDraft): locked is OnTheClock {
  return locked.slot !== null && locked.seat !== null;
}

/** Locks the draft row and works out the slot on the clock. */
async function lockDraft(tx: DbClient, draftId: number): Promise<LockedDraft | null> {
  const draft = await getCircuitDraftById(tx, draftId, { forUpdate: true });
  if (!draft) return null;
  const league = await getCircuitLeagueById(tx, draft.circuit_league_id);
  if (!league) return null;
  const seats = await listCircuitDraftSeats(tx, draft.id);
  const slot = circuitDraftSlot({
    seatCount: seats.length,
    rounds: draft.rounds,
    pickNumber: draft.current_pick_number,
    missed: await listMissedRegularCircuitDraftPicks(tx, draft.id)
  });
  const seat = slot
    ? (seats.find((s) => s.seat_number === slot.seat_number) ?? null)
    : null;
  return { draft, seats, league, slot, seat };
}

type PickOutcome =
  | {
      outcome: "PICKED";
      selectionId: number;
      source: "MANUAL" | "AUTO";
      requestId: string | null;
      actorUserId: number | null;
    }
  | { outcome: "MISSED" };

/**
 * Resolves the slot on the clock: writes the pick row, then either the
 * ownership change (a DRAFT or SUPPLEMENTAL transaction, in this database
 * transaction) or, for a supplemental pick missed again, its one chip. Then
 * moves the clock to the next slot, into the supplemental round when the
 * regular rounds end with missed picks, or completes the draft, moves the
 * league to IN_SEASON and sets rolling waiver priority in reverse draft order.
 */
async function resolveSlot(
  tx: DbClient,
  events: CircuitDraftEventRow[],
  locked: OnTheClock,
  resolution: PickOutcome,
  now: Date
) {
  const { draft, seats, league, slot, seat } = locked;
  const picked = resolution.outcome === "PICKED";
  let pick: CircuitDraftPickRow;
  try {
    pick = await insertCircuitDraftPick(tx, {
      draft_id: draft.id,
      pick_number: slot.pick_number,
      original_pick_number: slot.original_pick_number,
      seat_number: seat.seat_number,
      member_id: seat.member_id,
      outcome: resolution.outcome,
      selection_id: picked ? resolution.selectionId : null,
      source: picked ? resolution.source : "AUTO",
      request_id: picked ? resolution.requestId : null,
      actor_user_id: picked ? resolution.actorUserId : null
    });
  } catch (err) {
    const pg = err as { code?: string; constraint?: string };
    if (pg.code === "23505" && pg.constraint === "circuit_draft_pick_selection_key") {
      throw new AppError(
        "CIRCUIT_SELECTION_TAKEN",
        409,
        "Someone else already has that contender"
      );
    }
    if (pg.code === "23503" && pg.constraint === "circuit_draft_pick_selection_id_fkey") {
      throw new AppError("NOT_FOUND", 404, "That contender isn't in this season");
    }
    throw err;
  }

  let chip: CircuitChipRow | null = null;
  if (resolution.outcome === "PICKED") {
    await applyOwnershipChange(tx, league, {
      kind: slot.supplemental ? "SUPPLEMENTAL" : "DRAFT",
      memberId: seat.member_id,
      addSelectionId: resolution.selectionId,
      dropSelectionId: null,
      draftPickId: pick.id,
      actorUserId: resolution.actorUserId
    });
  } else if (slot.supplemental) {
    chip = await insertCircuitChip(tx, {
      circuit_league_id: league.id,
      member_id: seat.member_id,
      original_pick_number: slot.original_pick_number
    });
  }

  const missed = await listMissedRegularCircuitDraftPicks(tx, draft.id);
  const next = nextCircuitDraftPick({
    seatCount: seats.length,
    rounds: draft.rounds,
    pickNumber: slot.pick_number,
    missedCount: missed.length
  });
  const moved = next
    ? await updateCircuitDraftClock(tx, draft.id, {
        status: next.status,
        current_pick_number: next.pick_number,
        pick_deadline_at: computeDeadline(now, draft.pick_timer_seconds),
        paused_at: null
      })
    : await completeCircuitDraft(tx, draft.id);
  const clock = publicClock(moved, seats, missed);
  let event = picked
    ? await recordEvent(tx, events, draft.id, "draft.pick.made", {
        pick: publicPick(pick),
        selection: await draftedSelection(tx, resolution.selectionId),
        draft: draftState(moved),
        on_the_clock: clock
      })
    : await recordEvent(tx, events, draft.id, "draft.pick.missed", {
        pick: publicPick(pick),
        chip: chip && publicChip(chip),
        draft: draftState(moved),
        on_the_clock: clock
      });
  if (!next) {
    await moveCircuitLeagueStatus(tx, league.id, "DRAFTING", "IN_SEASON");
    await setCircuitWaiverPriorities(tx, league.id, initialWaiverPriorities(seats));
    event = await recordEvent(tx, events, draft.id, "draft.completed", {
      draft: draftState(moved),
      on_the_clock: null
    });
  }
  return {
    pick: publicPick(pick),
    chip: chip && publicChip(chip),
    draft: publicDraft({ ...moved, version: event.version })
  };
}

/** The drafted selection as the board names it; a pick event carries it. */
async function draftedSelection(tx: DbClient, selectionId: number) {
  const [row] = await listCircuitSelectionsByIds(tx, [selectionId]);
  return row ? toPublicCircuitSelection(row) : null;
}

function publicChip(chip: CircuitChipRow) {
  return {
    id: chip.id,
    member_id: chip.member_id,
    original_pick_number: chip.original_pick_number,
    status: chip.status
  };
}

/**
 * Submits the viewer's pick for the slot on the clock, regular or
 * supplemental. A repeat of an earlier `requestId` returns that pick
 * unchanged, even after the draft has moved on.
 */
export async function submitCircuitDraftPick(
  pool: Pool,
  draftId: number,
  viewer: Viewer,
  input: { selectionId: number; requestId: string },
  now: Date = new Date()
) {
  const { draft: found, circuitLeague } = await requireVisibleDraft(
    pool,
    draftId,
    viewer
  );
  const member = await getCircuitLeagueMemberByUser(
    pool,
    circuitLeague.id,
    viewer.userId
  );
  if (!member) {
    throw new AppError("CIRCUIT_MEMBERSHIP_REQUIRED", 403, "Join this season to draft");
  }
  const repeat = async (client: DbClient, draft: CircuitDraftRow) => {
    const prior = await getCircuitDraftPickByRequest(
      client,
      draft.id,
      member.id,
      input.requestId
    );
    return prior && { pick: publicPick(prior), draft: publicDraft(draft), reused: true };
  };
  const earlier = await repeat(pool, found);
  if (earlier) return earlier;

  const { result, events } = await runInTransaction(pool, async (tx) => {
    const events: CircuitDraftEventRow[] = [];
    const locked = await lockDraft(tx, found.id);
    if (!locked) throw DRAFT_NOT_FOUND();
    const raced = await repeat(tx, locked.draft);
    if (raced) return { result: raced, events };

    assertCircuitDraftTakingPicks(locked.draft);
    if (!isOnTheClock(locked)) {
      throw new AppError("CIRCUIT_DRAFT_NOT_IN_PROGRESS", 409, "The draft isn't running");
    }
    assertOnTheClock(locked.seat.member_id, member.id);
    const resolved = await resolveSlot(
      tx,
      events,
      locked,
      {
        outcome: "PICKED",
        selectionId: input.selectionId,
        source: "MANUAL",
        requestId: input.requestId,
        actorUserId: viewer.userId
      },
      now
    );
    return {
      result: { pick: resolved.pick, draft: resolved.draft, reused: false },
      events
    };
  });
  if (!result.reused) afterCommit(result.draft, events);
  return result;
}

/**
 * The auto-pick for the member on the clock (ADR 0005, section 6): the first
 * selection in their queue, read now, that nobody in the league owns, nobody
 * has drafted in this draft, and fits their roster and category limits. Null
 * means the pick is missed; it never looks outside the queue. The queue is
 * read in one statement, so it sees the queue as the last committed edit left
 * it. Ownership needs no lock here: while the draft runs, only picks change
 * it, and the caller holds the draft row.
 */
async function chooseQueuedSelection(
  tx: DbClient,
  league: CircuitLeagueRow,
  draftId: number,
  memberId: number
): Promise<number | null> {
  const queue = await listCircuitQueueForAutoPick(tx, memberId, league.circuit_id);
  if (queue.length === 0) return null;
  // One client runs one query at a time, so these run in turn.
  const unavailable = await listUnavailableCircuitDraftSelections(tx, {
    circuit_league_id: league.id,
    draft_id: draftId,
    selection_ids: queue.map((q) => q.selection_id)
  });
  const held = await listOpenOwnershipsForMember(tx, league.id, memberId);
  const categories = await listCircuitLeagueCategories(tx, league.id);
  return chooseCircuitAutoPick({
    queue,
    unavailable: new Set(unavailable),
    held,
    rosterSize: league.roster_size,
    maxOwnedByCategory: new Map(
      categories.map((c) => [c.circuit_category_id, c.max_owned])
    )
  });
}

/**
 * The sweeper's step for one Circuit draft: when the clock has run out on the
 * slot on the clock, resolves it by auto-pick from the member's queue (when
 * the league has auto-draft on), or records it as missed. A no-op when the
 * draft has moved on, paused or finished since the sweeper looked, so a
 * manual pick that lands first always wins.
 */
export async function tickCircuitDraft(pool: Pool, draftId: number, now = new Date()) {
  const { result, events } = await runInTransaction(pool, async (tx) => {
    const events: CircuitDraftEventRow[] = [];
    const locked = await lockDraft(tx, draftId);
    if (!locked || !isCircuitDraftPickDue(locked.draft, now)) {
      return { result: null, events };
    }
    if (!isOnTheClock(locked)) return { result: null, events };
    const { league, draft, seat } = locked;
    const selectionId = league.auto_draft_enabled
      ? await chooseQueuedSelection(tx, league, draft.id, seat.member_id)
      : null;
    const resolved = await resolveSlot(
      tx,
      events,
      locked,
      selectionId === null
        ? { outcome: "MISSED" }
        : {
            outcome: "PICKED",
            selectionId,
            source: "AUTO",
            requestId: null,
            actorUserId: null
          },
      now
    );
    return { result: resolved, events };
  });
  if (result) afterCommit(result.draft, events);
  return result;
}

/** The league owner pauses a running draft; the clock keeps its remaining time. */
export async function pauseCircuitDraft(
  pool: Pool,
  draftId: number,
  viewer: Viewer,
  now: Date = new Date()
) {
  const { result, events } = await runInTransaction(pool, async (tx) => {
    const events: CircuitDraftEventRow[] = [];
    const { draft, league, member } = await requireVisibleDraft(tx, draftId, viewer, {
      forUpdate: true
    });
    requireCommissioner(league, member, viewer.userId);
    assertCircuitDraftPausable(draft);
    const seats = await listCircuitDraftSeats(tx, draft.id);
    const moved = await updateCircuitDraftClock(tx, draft.id, {
      status: "PAUSED",
      current_pick_number: draft.current_pick_number!,
      pick_deadline_at: draft.pick_deadline_at,
      paused_at: now
    });
    const event = await recordEvent(tx, events, draft.id, "draft.paused", {
      draft: draftState(moved),
      on_the_clock: publicClock(
        moved,
        seats,
        await listMissedRegularCircuitDraftPicks(tx, draft.id)
      )
    });
    return {
      result: { draft: publicDraft({ ...moved, version: event.version }) },
      events
    };
  });
  emitCircuitDraftEvents(result.draft.circuit_league_id, events);
  return result;
}

/**
 * The league owner resumes a paused draft, in the supplemental round when
 * the regular rounds are over, with the time that was left on the clock.
 */
export async function resumeCircuitDraft(
  pool: Pool,
  draftId: number,
  viewer: Viewer,
  now: Date = new Date()
) {
  const { result, events } = await runInTransaction(pool, async (tx) => {
    const events: CircuitDraftEventRow[] = [];
    const { draft, league, member } = await requireVisibleDraft(tx, draftId, viewer, {
      forUpdate: true
    });
    requireCommissioner(league, member, viewer.userId);
    assertCircuitDraftResumable(draft);
    const seats = await listCircuitDraftSeats(tx, draft.id);
    const pickNumber = draft.current_pick_number!;
    const moved = await updateCircuitDraftClock(tx, draft.id, {
      status: resumedCircuitDraftStatus({
        seatCount: seats.length,
        rounds: draft.rounds,
        pickNumber
      }),
      current_pick_number: pickNumber,
      pick_deadline_at: resumedCircuitDraftDeadline({
        pickTimerSeconds: draft.pick_timer_seconds,
        pickDeadlineAt: draft.pick_deadline_at,
        pausedAt: draft.paused_at,
        now
      }),
      paused_at: null
    });
    const event = await recordEvent(tx, events, draft.id, "draft.resumed", {
      draft: draftState(moved),
      on_the_clock: publicClock(
        moved,
        seats,
        await listMissedRegularCircuitDraftPicks(tx, draft.id)
      )
    });
    return {
      result: { draft: publicDraft({ ...moved, version: event.version }) },
      events
    };
  });
  afterCommit(result.draft, events);
  return result;
}

/**
 * The board as of one draft version, for first load and reconnect: the
 * draft, its seats, every pick so far, the slot on the clock, the chips and
 * the drafted selections, so the board can name each pick.
 * Read under a share lock on the draft row, so no pick lands halfway through
 * and `draft.version` matches the last event the board includes. A client
 * applies the `draft:event` messages with a higher version, in order, and
 * fetches a new snapshot when it sees a gap.
 */
export async function getCircuitDraftSnapshot(
  pool: Pool,
  draftId: number,
  viewer: Viewer,
  now: Date = new Date()
) {
  return runInTransaction(pool, async (tx) => {
    const { draft } = await requireVisibleDraft(tx, draftId, viewer, { forShare: true });
    const seats = await listCircuitDraftSeats(tx, draft.id);
    const missed = await listMissedRegularCircuitDraftPicks(tx, draft.id);
    const picks = await listCircuitDraftPicks(tx, draft.id);
    const chips = await listCircuitChips(tx, draft.circuit_league_id);
    // In pick order, as a client that appends each pick event's selection has them.
    const drafted = picks.flatMap((p) =>
      p.selection_id === null ? [] : [p.selection_id]
    );
    const byId = new Map(
      (await listCircuitSelectionsByIds(tx, drafted)).map((s) => [s.id, s])
    );
    const selections = drafted.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toPublicCircuitSelection(row)] : [];
    });
    return {
      draft: publicDraft(draft),
      seats: seats.map(publicSeat),
      picks: picks.map(publicPick),
      on_the_clock: publicClock(draft, seats, missed),
      chips: chips.map(publicChip),
      selections,
      server_time: now.toISOString()
    };
  });
}

/** The snapshot of a league's draft, for clients that know only the league. */
export async function getCircuitLeagueDraftSnapshot(
  pool: Pool,
  circuitLeagueId: number,
  viewer: Viewer
) {
  const { circuitLeague } = await requireVisibleCircuitLeague(
    pool,
    circuitLeagueId,
    viewer
  );
  const draftId = await getCircuitDraftIdByLeague(pool, circuitLeague.id);
  if (draftId === null) {
    throw new AppError("CIRCUIT_DRAFT_NOT_STARTED", 404, "The draft hasn't started");
  }
  return getCircuitDraftSnapshot(pool, draftId, viewer);
}

/** The draft sweeper's pass over Circuit drafts, registered by the entry point. */
export const circuitDraftSweeperPass = {
  name: "circuit_draft",
  listExpired: listExpiredCircuitDraftIds,
  tick: (pool: Pool, id: number) => tickCircuitDraft(pool, id),
  nextWaitMs: getNextCircuitDraftDeadlineWaitMs
};
