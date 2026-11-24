import type {
  CircuitDraftSnapshot,
  CircuitLeagueCategory,
  CircuitLeagueMember,
  CircuitQueue,
  CircuitSelectionSummary
} from "../lib/types";
import { circuitSelectionLabel } from "./circuitRoster";
import { contenderFilmLabel } from "./contenders";
import type { ContenderPillState } from "./contenderPill";
import {
  circuitBoardCells,
  circuitPickIsSupplemental,
  type CircuitDraftClockView,
  type CircuitPickGate,
  type CircuitQueueRow
} from "./circuitDraft";
import { computeRoundPickLabel, computeSeatNumberForPickNumber } from "./draft";

/*
 * The season draft room in the ceremony draft room's frame (pure): the header
 * the ceremony room renders, the draft history and roster rails, and the
 * staged contenders beside the queue. The rails' rows use the ceremony rail's
 * "round-pick" labels, so both rooms read the same.
 */

/** The ceremony header's draft states: PENDING is the lobby. */
export type CircuitRoomStatus = "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";

export type CircuitRoomParticipant = {
  seatNumber: number;
  label: string;
  active: boolean;
  avatarKey: string | null;
};

export type CircuitRoomHeader = {
  status: CircuitRoomStatus;
  /** Seats in draft order; in the lobby, members by name with no seat yet. */
  participants: CircuitRoomParticipant[];
  /** Snake direction of the round on the clock; null outside the regular rounds. */
  direction: "FORWARD" | "REVERSE" | null;
  /** Null in the supplemental round, which has no round number. */
  roundNumber: number | null;
  pickNumber: number | null;
  isMyTurn: boolean;
  hasTimer: boolean;
  timerRemainingMs: number | null;
  /** "1:05": the pick clock the header shows; "—" with none running. */
  clockText: string;
};

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function circuitRoomStatus(
  snapshot: Pick<CircuitDraftSnapshot, "draft"> | null
): CircuitRoomStatus {
  if (!snapshot) return "PENDING";
  switch (snapshot.draft.status) {
    case "COMPLETED":
      return "COMPLETED";
    case "PAUSED":
      return "PAUSED";
    default:
      return "IN_PROGRESS";
  }
}

/** What the shared draft header shows for a season draft. */
export function circuitRoomHeader(input: {
  snapshot: CircuitDraftSnapshot | null;
  members: readonly Pick<CircuitLeagueMember, "user_id" | "username" | "avatar_key">[];
  viewerUserId: number | null;
  clock: CircuitDraftClockView | null;
}): CircuitRoomHeader {
  const { snapshot } = input;
  const avatars = new Map(input.members.map((m) => [m.user_id, m.avatar_key]));
  if (!snapshot) {
    return {
      status: "PENDING",
      participants: [...input.members]
        .sort((a, b) => a.username.localeCompare(b.username))
        .map((m, idx) => ({
          seatNumber: idx + 1,
          label: m.username,
          active: false,
          avatarKey: m.avatar_key
        })),
      direction: null,
      roundNumber: null,
      pickNumber: null,
      isMyTurn: false,
      hasTimer: false,
      timerRemainingMs: null,
      clockText: "—"
    };
  }
  const clock = snapshot.on_the_clock;
  const seatCount = snapshot.seats.length;
  const supplemental = clock
    ? circuitPickIsSupplemental({
        pickNumber: clock.pick_number,
        seatCount,
        rounds: snapshot.draft.rounds
      })
    : false;
  const round =
    clock && !supplemental ? Math.ceil(clock.pick_number / Math.max(1, seatCount)) : null;
  const viewerSeat = snapshot.seats.find((s) => s.user_id === input.viewerUserId);
  const secondsLeft = input.clock?.secondsLeft ?? null;
  return {
    status: circuitRoomStatus(snapshot),
    participants: [...snapshot.seats]
      .sort((a, b) => a.seat_number - b.seat_number)
      .map((s) => ({
        seatNumber: s.seat_number,
        label: s.username,
        active: clock?.seat_number === s.seat_number,
        avatarKey: avatars.get(s.user_id) ?? null
      })),
    direction: round === null ? null : round % 2 === 1 ? "FORWARD" : "REVERSE",
    roundNumber: round,
    pickNumber: clock?.pick_number ?? null,
    isMyTurn: Boolean(
      clock && viewerSeat && clock.seat_number === viewerSeat.seat_number
    ),
    hasTimer: Boolean(snapshot.draft.pick_timer_seconds),
    timerRemainingMs: secondsLeft === null ? null : secondsLeft * 1000,
    clockText: secondsLeft === null ? "—" : mmss(secondsLeft)
  };
}

export type CircuitHistoryRow = {
  pickNumber: number;
  /** "2-3" in the regular rounds (the ceremony rail's format), "S-4" for a supplemental pick. */
  roundPick: string;
  seatNumber: number | null;
  username: string;
  /** The contender, "Missed", or "—" for a slot still to come. */
  label: string;
  categoryName: string | null;
  missed: boolean;
  /** A contender was drafted in this slot. */
  picked: boolean;
  /** Drafted from the queue when the clock ran out. */
  auto: boolean;
  /** The slot on the clock. */
  active: boolean;
  /** The drafted contender, for its pill and nominee card; null for a missed or open slot. */
  selection: CircuitSelectionSummary | null;
  /** The nominee card's drafted chip: "1-3", or "1-3 · from queue" for an auto-pick. */
  draftedRoundPick: string;
};

/**
 * Every slot of the draft in pick order: resolved picks, the slot on the
 * clock, and the regular slots still to come (the snake order is fixed).
 * Supplemental slots appear once they resolve or go on the clock.
 */
export function circuitHistoryRows(
  snapshot: CircuitDraftSnapshot,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name">[]
): CircuitHistoryRow[] {
  const seatCount = snapshot.seats.length;
  const { rounds } = snapshot.draft;
  const usernames = new Map(snapshot.seats.map((s) => [s.seat_number, s.username]));
  const cells = new Map(
    circuitBoardCells(snapshot, categories).map((c) => [c.pickNumber, c])
  );
  const seatOf = new Map(snapshot.picks.map((p) => [p.pick_number, p.seat_number]));
  const selectionOf = circuitPickSelections(snapshot);
  const clock = snapshot.on_the_clock;
  const regular = seatCount * rounds;
  const last = Math.max(
    snapshot.draft.status === "COMPLETED" ? 0 : regular,
    clock?.pick_number ?? 0,
    ...snapshot.picks.map((p) => p.pick_number)
  );
  const rows: CircuitHistoryRow[] = [];
  for (let pickNumber = 1; pickNumber <= last; pickNumber += 1) {
    const cell = cells.get(pickNumber);
    const onClock = clock?.pick_number === pickNumber;
    if (!cell && !onClock && pickNumber > regular) continue;
    const supplemental = pickNumber > regular;
    const seatNumber =
      seatOf.get(pickNumber) ??
      (onClock ? (clock?.seat_number ?? null) : null) ??
      (supplemental ? null : computeSeatNumberForPickNumber({ pickNumber, seatCount }));
    const roundPick = supplemental
      ? `S-${pickNumber - regular}`
      : computeRoundPickLabel({ pickNumber, seatCount });
    rows.push({
      pickNumber,
      roundPick,
      seatNumber,
      username: seatNumber === null ? "—" : (usernames.get(seatNumber) ?? "Player"),
      label: cell ? cell.label : "—",
      categoryName: cell?.categoryName ?? null,
      missed: cell?.missed ?? false,
      picked: Boolean(cell && !cell.missed),
      auto: cell?.auto ?? false,
      active: onClock,
      selection: cell && !cell.missed ? (selectionOf.get(pickNumber) ?? null) : null,
      draftedRoundPick: cell?.auto ? `${roundPick} · from queue` : roundPick
    });
  }
  return rows;
}

/** The drafted selection of each picked slot, by pick number. */
function circuitPickSelections(
  snapshot: Pick<CircuitDraftSnapshot, "picks" | "selections">
): Map<number, CircuitSelectionSummary> {
  const selections = new Map(snapshot.selections.map((s) => [s.id, s]));
  const out = new Map<number, CircuitSelectionSummary>();
  for (const pick of snapshot.picks) {
    const selection =
      pick.outcome === "PICKED" && pick.selection_id !== null
        ? selections.get(pick.selection_id)
        : undefined;
    if (selection) out.set(pick.pick_number, selection);
  }
  return out;
}

/**
 * The viewer's resolved picks, in pick order, as the roster rail lists them.
 * A supplemental pick shows the round-pick of the slot it made up ("1-2"),
 * not its "S-n": on a roster a pick is a pick.
 */
export function circuitMyRosterRows(
  snapshot: CircuitDraftSnapshot,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name">[],
  viewerUserId: number | null
): CircuitHistoryRow[] {
  const seat = snapshot.seats.find((s) => s.user_id === viewerUserId);
  if (!seat) return [];
  const seatCount = snapshot.seats.length;
  const original = new Map(
    snapshot.picks.map((p) => [p.pick_number, p.original_pick_number])
  );
  return circuitHistoryRows(snapshot, categories)
    .filter((r) => r.seatNumber === seat.seat_number && r.picked)
    .map((r) => ({
      ...r,
      roundPick: computeRoundPickLabel({
        pickNumber: original.get(r.pickNumber) ?? r.pickNumber,
        seatCount
      })
    }));
}

/** Who drafted a contender, for the nominee card's drafted chip. */
export type CircuitDraftedBy = {
  userId: number;
  username: string;
  avatarKey: string | null;
  /** "1-3", or "S-1" for a supplemental pick; "· from queue" for an auto-pick. */
  roundPick: string;
};

/** Every drafted contender of the snapshot, by selection id. */
export function circuitDraftedBy(
  snapshot: CircuitDraftSnapshot,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name">[],
  members: readonly Pick<CircuitLeagueMember, "user_id" | "avatar_key">[]
): Map<number, CircuitDraftedBy> {
  const avatars = new Map(members.map((m) => [m.user_id, m.avatar_key]));
  const userOf = new Map(snapshot.seats.map((s) => [s.seat_number, s.user_id]));
  const out = new Map<number, CircuitDraftedBy>();
  for (const row of circuitHistoryRows(snapshot, categories)) {
    if (!row.selection || row.seatNumber === null) continue;
    const userId = userOf.get(row.seatNumber);
    if (userId === undefined) continue;
    out.set(row.selection.id, {
      userId,
      username: row.username,
      avatarKey: avatars.get(userId) ?? null,
      roundPick: row.draftedRoundPick
    });
  }
  return out;
}

/** A staging pill's look and whether its gestures act (`aria-disabled` when not). */
export type CircuitStagingPill = { state: ContenderPillState; disabled: boolean };

/**
 * A staging pill's state: drafted contenders are muted, the one being
 * drafted is pending (and every other pill waits for it), and only the
 * viewer on the clock can arm one. Arming shows the inverted pill.
 */
export function circuitStagingPill(input: {
  selectionId: number;
  drafted: boolean;
  canDraft: boolean;
  armedId: number | null;
  pendingId: number | null;
}): CircuitStagingPill {
  if (input.drafted) return { state: "muted", disabled: true };
  if (input.pendingId === input.selectionId) return { state: "pending", disabled: true };
  if (input.pendingId !== null || !input.canDraft) {
    return { state: "default", disabled: true };
  }
  return {
    state: input.armedId === input.selectionId ? "armed" : "default",
    disabled: false
  };
}

export type CircuitStagingMenuKey =
  "draft" | "up" | "down" | "stage" | "removeQueued" | "queue" | "removeStaged";

export type CircuitStagingMenuItem = {
  key: CircuitStagingMenuKey;
  label: string;
  disabled: boolean;
};

/**
 * A staging row's menu: Draft first while the viewer can draft it (the
 * discoverable path beside the double-click), then the list's own moves. A
 * drafted contender can only come off the list.
 */
export function circuitStagingMenu(input: {
  list: "queue" | "staged";
  drafted: boolean;
  canDraft: boolean;
  /** A queue or staging write is under way. */
  busy: boolean;
  removing: boolean;
  /** The row's place in the queue. */
  index: number;
  count: number;
}): CircuitStagingMenuItem[] {
  const { busy } = input;
  const remove: CircuitStagingMenuItem =
    input.list === "queue"
      ? {
          key: "removeQueued",
          label: "Remove from queue",
          disabled: busy || input.removing
        }
      : {
          key: "removeStaged",
          label: "Remove from staged",
          disabled: busy || input.removing
        };
  if (input.drafted) return [remove];
  const draft: CircuitStagingMenuItem[] = input.canDraft
    ? [{ key: "draft", label: "Draft", disabled: false }]
    : [];
  if (input.list === "staged") {
    return [...draft, { key: "queue", label: "Add to queue", disabled: busy }, remove];
  }
  return [
    ...draft,
    { key: "up", label: "Move up", disabled: busy || input.index === 0 },
    {
      key: "down",
      label: "Move down",
      disabled: busy || input.index === input.count - 1
    },
    { key: "stage", label: "Move to staged", disabled: busy },
    remove
  ];
}

/** The polite note when an armed contender is drafted before the viewer confirms it. */
export function circuitSelectionClearedNote(label: string): string {
  return `Selection cleared: ${label} is no longer available`;
}

/** The form's preview pill for the contender being built. */
export type CircuitDraftPreview = {
  label: string;
  categoryName: string;
  iconCode: string | null;
  iconVariant: string;
  /** Muted with a caption when someone has drafted it already. */
  owned: boolean;
  /** "Owned by pia" or "Already on your roster"; null for a free contender. */
  caption: string | null;
  /** The same words for the pill's accessible name: "owned by pia". */
  stateSuffix: string | null;
};

/**
 * The contender the form has built (category, film and, for acting, the
 * person) as a pill. In the draft room a contender is owned once drafted,
 * so the snapshot says who holds it without asking the server.
 */
export function circuitDraftPreview(input: {
  category: { id: number; name: string; kind: string } | null;
  film: { tmdb_id: number; title: string; release_year: number | null } | null;
  person: { tmdb_id: number; name: string } | null;
  categories: readonly Pick<
    CircuitLeagueCategory,
    "id" | "name" | "icon_code" | "icon_variant"
  >[];
  snapshot: Pick<CircuitDraftSnapshot, "picks" | "seats" | "selections"> | null;
  viewerUserId: number | null;
}): CircuitDraftPreview | null {
  const { category, film } = input;
  if (!category || !film) return null;
  const person = category.kind === "ACTING" ? input.person : null;
  if (category.kind === "ACTING" && !person) return null;
  const leagueCategory = input.categories.find((c) => c.id === category.id) ?? null;
  const filmLabel = contenderFilmLabel(film);
  const selection = input.snapshot?.selections.find(
    (s) =>
      s.circuit_category_id === category.id &&
      s.film_tmdb_id === film.tmdb_id &&
      (s.person_tmdb_id ?? null) === (person?.tmdb_id ?? null)
  );
  const pick = selection
    ? input.snapshot?.picks.find(
        (p) => p.outcome === "PICKED" && p.selection_id === selection.id
      )
    : undefined;
  const seat = pick
    ? input.snapshot?.seats.find((s) => s.seat_number === pick.seat_number)
    : undefined;
  const caption = seat
    ? seat.user_id === input.viewerUserId
      ? "Already on your roster"
      : `Owned by ${seat.username}`
    : null;
  return {
    label: person ? `${person.name}, ${filmLabel}` : filmLabel,
    categoryName: leagueCategory?.name ?? category.name,
    iconCode: leagueCategory?.icon_code ?? null,
    iconVariant: leagueCategory?.icon_variant ?? "default",
    owned: Boolean(seat),
    caption,
    stateSuffix: caption ? caption.charAt(0).toLowerCase() + caption.slice(1) : null
  };
}

/**
 * The staging lists' note: how to draft from them while the viewer is on the
 * clock (double-click or select and confirm; on a phone, tap then Draft),
 * otherwise why they cannot yet.
 */
export function circuitStagingNote(input: {
  gate: Pick<CircuitPickGate, "canPick" | "reason">;
  phone: boolean;
}): string {
  if (!input.gate.canPick) {
    return `${input.gate.reason} You can draft from here when you're on the clock.`;
  }
  return input.phone
    ? "You're on the clock. Tap a contender, then Draft."
    : "You're on the clock. Double-click a contender to draft it, or select it and confirm.";
}

/** The viewer's staged contenders, oldest first, marked when drafted. */
export function circuitStagedRows(
  queue: Pick<CircuitQueue, "staged">,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name">[],
  snapshot: Pick<CircuitDraftSnapshot, "picks"> | null
): CircuitQueueRow[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const drafted = new Set(
    (snapshot?.picks ?? []).flatMap((p) =>
      p.selection_id === null ? [] : [p.selection_id]
    )
  );
  return queue.staged.map(({ selection }) => ({
    selection,
    label: circuitSelectionLabel(selection),
    categoryName: names.get(selection.circuit_category_id) ?? null,
    drafted: drafted.has(selection.id)
  }));
}
