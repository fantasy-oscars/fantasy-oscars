import type {
  CircuitDraftSnapshot,
  CircuitLeagueCategory,
  CircuitLeagueMember,
  CircuitQueue
} from "../lib/types";
import { circuitSelectionLabel } from "./circuitRoster";
import {
  circuitBoardCells,
  circuitPickIsSupplemental,
  type CircuitDraftClockView,
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
    rows.push({
      pickNumber,
      roundPick: supplemental
        ? `S-${pickNumber - regular}`
        : computeRoundPickLabel({ pickNumber, seatCount }),
      seatNumber,
      username: seatNumber === null ? "—" : (usernames.get(seatNumber) ?? "Player"),
      label: cell ? cell.label : "—",
      categoryName: cell?.categoryName ?? null,
      missed: cell?.missed ?? false,
      picked: Boolean(cell && !cell.missed),
      auto: cell?.auto ?? false,
      active: onClock
    });
  }
  return rows;
}

/** The viewer's resolved picks, in pick order, as the roster rail lists them. */
export function circuitMyRosterRows(
  snapshot: CircuitDraftSnapshot,
  categories: readonly Pick<CircuitLeagueCategory, "id" | "name">[],
  viewerUserId: number | null
): CircuitHistoryRow[] {
  const seat = snapshot.seats.find((s) => s.user_id === viewerUserId);
  if (!seat) return [];
  return circuitHistoryRows(snapshot, categories).filter(
    (r) => r.seatNumber === seat.seat_number && r.picked
  );
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
