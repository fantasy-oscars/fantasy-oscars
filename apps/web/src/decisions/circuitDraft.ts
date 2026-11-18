import type {
  CircuitDraftEventMessage,
  CircuitDraftPick,
  CircuitDraftSnapshot,
  CircuitDraftStatus,
  CircuitLeagueCategory,
  CircuitLeagueSettings,
  CircuitLeagueStatus,
  CircuitQueue,
  CircuitSelectionSummary
} from "../lib/types";
import { circuitSelectionLabel } from "./circuitRoster";
import { durationLabel } from "./fullSeasonSummary";

/*
 * The draft of a league's season (pure): the lobby before it starts, then the
 * board built from the snapshot, and the viewer's queue beside both. Players
 * see "season", never "Circuit". The server enforces every draft rule; these
 * functions only describe the state it reports.
 */

export type CircuitDraftPhase = "lobby" | "live" | "paused" | "completed";

/** Lobby until the snapshot exists; then the draft's own state. */
export function circuitDraftPhase(
  snapshot: Pick<CircuitDraftSnapshot, "draft"> | null
): CircuitDraftPhase {
  if (!snapshot) return "lobby";
  switch (snapshot.draft.status) {
    case "COMPLETED":
      return "completed";
    case "PAUSED":
      return "paused";
    default:
      return "live";
  }
}

export function circuitDraftStatusLabel(status: CircuitDraftStatus | string): string {
  switch (status) {
    case "IN_PROGRESS":
      return "Drafting";
    case "SUPPLEMENTAL":
      return "Supplemental round";
    case "PAUSED":
      return "Paused";
    case "COMPLETED":
      return "Draft complete";
    default:
      return "Draft";
  }
}

/** Whether a pick number falls after the regular rounds. */
export function circuitPickIsSupplemental(input: {
  pickNumber: number;
  seatCount: number;
  rounds: number;
}): boolean {
  return input.pickNumber > input.seatCount * input.rounds;
}

/** "Round 2, pick 7", or "Supplemental, for pick 3" after the regular rounds. */
export function circuitDraftSlotLabel(input: {
  pickNumber: number;
  originalPickNumber: number;
  seatCount: number;
  rounds: number;
}): string {
  if (circuitPickIsSupplemental(input)) {
    return `Supplemental, for pick ${input.originalPickNumber}`;
  }
  const round = Math.ceil(input.pickNumber / Math.max(1, input.seatCount));
  return `Round ${round}, pick ${input.pickNumber}`;
}

export type CircuitBoardCell = {
  pickNumber: number;
  slotLabel: string;
  supplemental: boolean;
  missed: boolean;
  /** The pick came from the player's queue when the clock ran out. */
  auto: boolean;
  /** The drafted contender's label, or "Missed". */
  label: string;
  categoryId: number | null;
  categoryName: string | null;
  username: string;
  /** Why a missed slot matters: the supplemental pick to come, or the chip. */
  note: string | null;
};

export type CircuitBoardSeat = {
  seatNumber: number;
  userId: number;
  username: string;
  isViewer: boolean;
  onTheClock: boolean;
  cells: CircuitBoardCell[];
  /** "3 of 16": drafted contenders against the roster size. */
  countLabel: string;
};

export type CircuitBoardCategory = {
  id: number;
  name: string;
  cells: CircuitBoardCell[];
};

function missedNote(
  pick: CircuitDraftPick,
  supplemental: boolean,
  picks: readonly CircuitDraftPick[]
): string | null {
  if (pick.outcome !== "MISSED") return null;
  if (supplemental)
    return `Missed again, so a chip for pick ${pick.original_pick_number}`;
  const madeUp = picks.some(
    (p) =>
      p.original_pick_number === pick.pick_number && p.pick_number !== pick.pick_number
  );
  return madeUp
    ? "Made up in the supplemental round"
    : "A supplemental pick follows the last round";
}

/** Every resolved pick of the snapshot as a board cell, in pick order. */
export function circuitBoardCells(
  snapshot: CircuitDraftSnapshot,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name">[]
): CircuitBoardCell[] {
  const seatCount = snapshot.seats.length;
  const { rounds } = snapshot.draft;
  const selections = new Map(snapshot.selections.map((s) => [s.id, s]));
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const usernames = new Map(snapshot.seats.map((s) => [s.seat_number, s.username]));
  return [...snapshot.picks]
    .sort((a, b) => a.pick_number - b.pick_number)
    .map((pick) => {
      const supplemental = circuitPickIsSupplemental({
        pickNumber: pick.pick_number,
        seatCount,
        rounds
      });
      const selection =
        pick.selection_id === null ? undefined : selections.get(pick.selection_id);
      const categoryId = selection?.circuit_category_id ?? null;
      return {
        pickNumber: pick.pick_number,
        slotLabel: circuitDraftSlotLabel({
          pickNumber: pick.pick_number,
          originalPickNumber: pick.original_pick_number,
          seatCount,
          rounds
        }),
        supplemental,
        missed: pick.outcome === "MISSED",
        auto: pick.outcome === "PICKED" && pick.source === "AUTO",
        label:
          pick.outcome === "MISSED"
            ? "Missed"
            : selection
              ? circuitSelectionLabel(selection)
              : "Drafted contender",
        categoryId,
        categoryName:
          categoryId === null ? null : (categoryNames.get(categoryId) ?? null),
        username: usernames.get(pick.seat_number) ?? "Player",
        note: missedNote(pick, supplemental, snapshot.picks)
      };
    });
}

/** The board by player: seats in draft order, each with its picks in order. */
export function circuitBoardBySeat(
  snapshot: CircuitDraftSnapshot,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name">[],
  viewerUserId: number | null
): CircuitBoardSeat[] {
  const cells = circuitBoardCells(snapshot, categories);
  const pickSeat = new Map(snapshot.picks.map((p) => [p.pick_number, p.seat_number]));
  return [...snapshot.seats]
    .sort((a, b) => a.seat_number - b.seat_number)
    .map((seat) => {
      const own = cells.filter((c) => pickSeat.get(c.pickNumber) === seat.seat_number);
      const drafted = own.filter((c) => !c.missed).length;
      return {
        seatNumber: seat.seat_number,
        userId: seat.user_id,
        username: seat.username,
        isViewer: seat.user_id === viewerUserId,
        onTheClock: snapshot.on_the_clock?.seat_number === seat.seat_number,
        cells: own,
        countLabel: `${drafted} of ${snapshot.draft.rounds}`
      };
    });
}

/** The board by category: the league's categories in order, each with its picks. */
export function circuitBoardByCategory(
  snapshot: CircuitDraftSnapshot,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name" | "sort_index">[]
): CircuitBoardCategory[] {
  const cells = circuitBoardCells(snapshot, categories);
  return [...categories]
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((category) => ({
      id: category.id,
      name: category.name,
      cells: cells.filter((c) => c.categoryId === category.id)
    }));
}

/** "Round 1, pick 1 · casey", the slot on the clock; null when none is. */
export function circuitOnTheClockLabel(snapshot: CircuitDraftSnapshot): string | null {
  const clock = snapshot.on_the_clock;
  if (!clock) return null;
  const seat = snapshot.seats.find((s) => s.seat_number === clock.seat_number);
  const slot = circuitDraftSlotLabel({
    pickNumber: clock.pick_number,
    originalPickNumber: clock.original_pick_number,
    seatCount: snapshot.seats.length,
    rounds: snapshot.draft.rounds
  });
  return `${slot} · ${seat?.username ?? "Player"}`;
}

/**
 * The season page's link to the draft: the lobby before it starts, the room
 * while drafting and the finished board after.
 */
export function circuitDraftLinkLabel(status: CircuitLeagueStatus | string): string {
  switch (status) {
    case "DRAFTING":
      return "Draft room";
    case "IN_SEASON":
    case "COMPLETE":
      return "Draft board";
    default:
      return "Draft lobby";
  }
}

/** What the lobby says about when the draft starts. */
export function circuitDraftStartNote(input: {
  status: CircuitLeagueStatus | string;
  canManage: boolean;
}): string {
  if (input.status === "SETUP") {
    return input.canManage
      ? "Lock the season from its page first. You can start the draft once it is locked."
      : "The draft opens once the commissioner locks the season.";
  }
  return input.canManage
    ? "Start the draft when everyone is ready, with Start draft at the top of the room. The draft order is drawn at random when it starts."
    : "The commissioner starts the draft. The draft order is drawn at random when it starts.";
}

/** The lobby's draft facts: rounds, order, clock and auto-draft. */
export function circuitDraftLobbyFacts(
  settings: Pick<
    CircuitLeagueSettings,
    "roster_size" | "pick_timer_seconds" | "auto_draft_enabled"
  >
): Array<{ label: string; value: string }> {
  const clock = settings.pick_timer_seconds;
  return [
    { label: "Rounds", value: String(settings.roster_size) },
    { label: "Order", value: "Snake, drawn at random" },
    {
      label: "Pick clock",
      value: clock && clock > 0 ? durationLabel(clock) : "No clock"
    },
    {
      label: "Auto-draft",
      value: settings.auto_draft_enabled
        ? "From your queue when the clock runs out"
        : "Off: a pick missed on the clock is missed"
    }
  ];
}

export type CircuitQueueRow = {
  selection: CircuitSelectionSummary;
  label: string;
  categoryName: string | null;
  /** Someone drafted it; auto-draft skips it, and it stays queued. */
  drafted: boolean;
};

/** The queue top first, with each row's category and whether it is drafted. */
export function circuitQueueRows(
  queue: CircuitQueue,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name">[],
  snapshot: Pick<CircuitDraftSnapshot, "picks"> | null
): CircuitQueueRow[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const drafted = new Set(
    (snapshot?.picks ?? []).flatMap((p) =>
      p.selection_id === null ? [] : [p.selection_id]
    )
  );
  return [...queue.items]
    .sort((a, b) => a.position - b.position)
    .map(({ selection }) => ({
      selection,
      label: circuitSelectionLabel(selection),
      categoryName: names.get(selection.circuit_category_id) ?? null,
      drafted: drafted.has(selection.id)
    }));
}

/** `ids` with `fromId` moved to the place of `toId`; null when nothing moves. */
export function circuitQueueMoved(
  ids: readonly number[],
  fromId: number,
  toId: number
): number[] | null {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...ids];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}

/** A person-facing message for a failed queue or draft write. */
export function circuitDraftErrorMessage(
  err: { errorCode?: string; message?: string },
  fallback: string
): string {
  switch (err.errorCode) {
    case "CIRCUIT_QUEUE_CHANGED":
      return "Your queue changed in another window. It has been reloaded; try again.";
    case "CIRCUIT_MEMBERSHIP_REQUIRED":
      return "Join this season to keep a draft queue.";
    case "CIRCUIT_DRAFT_NOT_YOUR_TURN":
      return "It isn't your pick any more. The board has been refreshed.";
    case "CIRCUIT_DRAFT_PAUSED":
      return "The draft is paused. Pick once the commissioner resumes it.";
    case "CIRCUIT_DRAFT_NOT_IN_PROGRESS":
      return "The draft isn't running.";
    case "CIRCUIT_SELECTION_TAKEN":
    case "CIRCUIT_SELECTION_ALREADY_OWNED":
      return "Someone has already drafted that contender. Choose another.";
    case "CIRCUIT_ROSTER_FULL":
      return "Your roster is full.";
    case "CIRCUIT_CATEGORY_FULL":
      return "You already have as many contenders in that category as this season allows.";
    case "RATE_LIMITED":
      return "Too many pick attempts. Wait a moment and try again.";
    default:
      return err.message || fallback;
  }
}

/* ---------------------------------------------------------------------------
 * The live draft: socket events, the clock, whose pick it is.
 * ------------------------------------------------------------------------- */

export type CircuitDraftEventOutcome =
  /** Already in the snapshot (an older or repeated version): nothing to do. */
  | { kind: "stale" }
  /** A version was missed, or the event cannot be applied: fetch the snapshot. */
  | { kind: "resync" }
  | { kind: "applied"; snapshot: CircuitDraftSnapshot };

/**
 * Applies one `draft:event` to the snapshot. Only the next version applies;
 * an older one is stale and a later one means a gap, which the caller closes
 * by fetching the snapshot. `draft` and `on_the_clock` are replaced; `pick`,
 * `selection` and `chip` are appended; `seats` replace the seats.
 */
export function applyCircuitDraftEvent(
  snapshot: CircuitDraftSnapshot | null | undefined,
  message: CircuitDraftEventMessage
): CircuitDraftEventOutcome {
  if (!snapshot || snapshot.draft.id !== message.draft_id) return { kind: "resync" };
  const current = snapshot.draft.version;
  if (message.version <= current) return { kind: "stale" };
  if (message.version !== current + 1 || !message.payload) return { kind: "resync" };
  const { draft, on_the_clock, pick, selection, chip, seats } = message.payload;
  const appendBy = <T>(list: T[], item: T | null | undefined, key: (t: T) => number) =>
    item && !list.some((x) => key(x) === key(item)) ? [...list, item] : list;
  return {
    kind: "applied",
    snapshot: {
      ...snapshot,
      draft: { ...snapshot.draft, ...(draft ?? {}), version: message.version },
      on_the_clock:
        on_the_clock === undefined ? snapshot.on_the_clock : (on_the_clock ?? null),
      seats: seats ?? snapshot.seats,
      picks: appendBy(snapshot.picks, pick, (p) => p.pick_number).sort(
        (a, b) => a.pick_number - b.pick_number
      ),
      selections: appendBy(snapshot.selections, selection, (s) => s.id),
      chips: appendBy(snapshot.chips, chip, (c) => c.id),
      server_time: message.server_time
    }
  };
}

/** Whether a selection has been drafted in this draft. */
export function circuitSelectionDrafted(
  snapshot: Pick<CircuitDraftSnapshot, "picks">,
  selectionId: number
): boolean {
  return snapshot.picks.some((p) => p.selection_id === selectionId);
}

export type CircuitDraftClockView = {
  /** "1:05 left", "Paused with 0:42 left", "No pick clock"; null with no pick on the clock. */
  label: string | null;
  /** Whole seconds left, or null when untimed or nothing is on the clock. */
  secondsLeft: number | null;
  /** Ten seconds or fewer on a running clock. */
  urgent: boolean;
};

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The pick clock as of `nowMs` on the server's clock. A paused draft shows
 * the time it paused with; the server resumes it with that time left.
 */
export function circuitDraftClock(
  snapshot: Pick<CircuitDraftSnapshot, "draft" | "on_the_clock">,
  nowMs: number
): CircuitDraftClockView {
  const { draft } = snapshot;
  if (!snapshot.on_the_clock || draft.status === "COMPLETED") {
    return { label: null, secondsLeft: null, urgent: false };
  }
  const deadline = draft.pick_deadline_at ? Date.parse(draft.pick_deadline_at) : NaN;
  if (!draft.pick_timer_seconds || !Number.isFinite(deadline)) {
    return { label: "No pick clock", secondsLeft: null, urgent: false };
  }
  if (draft.status === "PAUSED") {
    const pausedAt = draft.paused_at ? Date.parse(draft.paused_at) : NaN;
    const left = Number.isFinite(pausedAt)
      ? Math.max(0, Math.ceil((deadline - pausedAt) / 1000))
      : null;
    return {
      label: left === null ? "Paused" : `Paused with ${mmss(left)} left`,
      secondsLeft: left,
      urgent: false
    };
  }
  const left = Math.max(0, Math.ceil((deadline - nowMs) / 1000));
  return { label: `${mmss(left)} left`, secondsLeft: left, urgent: left <= 10 };
}

export type CircuitPickGate = {
  /** The viewer holds the slot on the clock. */
  onTheClock: boolean;
  canPick: boolean;
  /** Why the picker is disabled, or what to do when it is not. */
  reason: string;
};

/**
 * Whether the viewer may pick now. Only the member whose seat is on the
 * clock may pick, while the draft runs and the live connection is up.
 */
export function circuitPickGate(input: {
  snapshot: Pick<CircuitDraftSnapshot, "draft" | "seats" | "on_the_clock">;
  viewerUserId: number | null;
  /** Set while the socket is down; the connection's own wording. */
  connectionBlockedReason: string | null;
}): CircuitPickGate {
  const { snapshot, viewerUserId } = input;
  const clock = snapshot.on_the_clock;
  const seat = clock
    ? snapshot.seats.find((s) => s.seat_number === clock.seat_number)
    : undefined;
  const onTheClock = seat !== undefined && seat.user_id === viewerUserId;
  const blocked = (reason: string): CircuitPickGate => ({
    onTheClock,
    canPick: false,
    reason
  });
  if (snapshot.draft.status === "COMPLETED" || !clock) {
    return blocked("The draft is complete.");
  }
  if (snapshot.draft.status === "PAUSED") {
    return blocked("The draft is paused. Picks resume when the commissioner resumes it.");
  }
  if (!onTheClock) {
    return blocked(`Waiting for ${seat?.username ?? "another player"} to pick.`);
  }
  if (input.connectionBlockedReason) return blocked(input.connectionBlockedReason);
  return {
    onTheClock,
    canPick: true,
    reason: clock.supplemental
      ? "You're on the clock for your supplemental pick."
      : "You're on the clock."
  };
}

/**
 * What the live region announces when the turn moves: the slot and who has
 * it, with "your pick" for the viewer. Empty in the lobby.
 */
export function circuitTurnAnnouncement(
  snapshot: CircuitDraftSnapshot | null,
  viewerUserId: number | null
): string {
  if (!snapshot) return "";
  if (snapshot.draft.status === "COMPLETED") return "The draft is complete.";
  if (snapshot.draft.status === "PAUSED") return "The draft is paused.";
  const clock = snapshot.on_the_clock;
  if (!clock) return "";
  const label = circuitOnTheClockLabel(snapshot);
  const seat = snapshot.seats.find((s) => s.seat_number === clock.seat_number);
  return seat && seat.user_id === viewerUserId
    ? `Your pick. ${label ?? ""}`.trim()
    : `On the clock: ${label ?? ""}`.trim();
}

/** What the room says about the round under way. */
export function circuitDraftRoundNote(
  snapshot: Pick<CircuitDraftSnapshot, "draft" | "on_the_clock">
): string | null {
  if (snapshot.on_the_clock?.supplemental) {
    return "Supplemental round: each pick missed in the regular rounds gets one more chance, in pick order. A pick missed again becomes a chip.";
  }
  return null;
}
