import { formatTimer } from "../lib/draft";
import type { Snapshot } from "../lib/types";

export type DraftRoomView = "draft" | "roster";
export type PoolMode = "UNDRAFTED_ONLY" | "ALL_MUTED";

export type DraftTurn = {
  current_pick_number: number;
  seat_number: number;
  round_number: number;
  direction: "FORWARD" | "REVERSE";
};

export function computeTurn(snapshot: Snapshot): DraftTurn | null {
  if (snapshot.turn) return snapshot.turn as DraftTurn;
  const pickNumber = snapshot.draft.current_pick_number ?? null;
  if (!pickNumber || snapshot.seats.length === 0) return null;

  const seatCount = snapshot.seats.length;
  const round = Math.ceil(pickNumber / seatCount);
  const idx = (pickNumber - 1) % seatCount;

  const seatNumber = round % 2 === 1 ? idx + 1 : seatCount - idx;
  const direction = round % 2 === 1 ? "FORWARD" : "REVERSE";

  return {
    current_pick_number: pickNumber,
    seat_number: seatNumber,
    round_number: round,
    direction
  };
}

export function buildDraftedSet(picks: Snapshot["picks"]) {
  const drafted = new Set<number>();
  for (const p of picks) drafted.add(p.nomination_id);
  return drafted;
}

export function buildNominationLabelById(snapshot: Snapshot | null) {
  const map = new Map<number, string>();
  const rows = snapshot?.nominations ?? [];
  for (const n of rows) map.set(n.id, n.label);
  return map;
}

export function buildIconByCategoryId(snapshot: Snapshot | null) {
  const map = new Map<number, string>();
  const cats = snapshot?.categories ?? [];
  for (const c of cats) {
    if (c.icon_code) map.set(c.id, c.icon_code);
  }
  return map;
}

export function buildNominationsByCategoryId(snapshot: Snapshot | null) {
  const nominations = snapshot?.nominations ?? [];
  const map = new Map<number, Snapshot["nominations"]>();
  for (const n of nominations) {
    const list = map.get(n.category_edition_id) ?? [];
    list.push(n);
    map.set(n.category_edition_id, list);
  }
  return map;
}

export function buildPicksByNumber(snapshot: Snapshot) {
  const map = new Map<number, Snapshot["picks"][number]>();
  for (const p of snapshot.picks) map.set(p.pick_number, p);
  return map;
}

export function buildPicksBySeat(snapshot: Snapshot) {
  const map = new Map<number, Snapshot["picks"]>();
  for (const seat of snapshot.seats) map.set(seat.seat_number, []);
  for (const p of snapshot.picks) {
    const list = map.get(p.seat_number) ?? [];
    list.push(p);
    map.set(p.seat_number, list);
  }
  for (const [k, list] of map.entries()) {
    list.sort((a, b) => a.pick_number - b.pick_number);
    map.set(k, list);
  }
  return map;
}

export function getMaxPicksForSeats(
  seats: Snapshot["seats"],
  picksBySeat: Map<number, Snapshot["picks"]>
) {
  let max = 0;
  for (const seat of seats) {
    max = Math.max(max, (picksBySeat.get(seat.seat_number) ?? []).length);
  }
  return max;
}

export function computeDraftClockText(snapshot: Snapshot, nowTs: number) {
  return formatTimer(snapshot.draft, nowTs);
}

export function computePickDisabledReason(args: {
  snapshot: Snapshot | null;
  disabled?: boolean;
  activeSeatNumber: number | null;
  mySeatNumber: number | null;
  selectedNominationId: number | null;
  drafted: Set<number>;
}) {
  const {
    snapshot,
    disabled,
    activeSeatNumber,
    mySeatNumber,
    selectedNominationId,
    drafted
  } = args;

  if (disabled) return "Sign in to make picks.";
  if (!snapshot) return "Load the draft first.";
  if (snapshot.draft.status === "PAUSED") return "Draft is paused.";
  if (snapshot.draft.status !== "IN_PROGRESS") return "Draft is not in progress.";
  if (activeSeatNumber === null) return "Turn information unavailable.";
  if (mySeatNumber === null) return "You are not seated in this draft.";
  if (activeSeatNumber !== mySeatNumber)
    return `Waiting for seat ${activeSeatNumber} to pick.`;
  if (!selectedNominationId) return "Select a nominee first.";
  if (drafted.has(selectedNominationId)) return "That nominee was already drafted.";
  return null;
}

export function computeDraftBoardCols(args: {
  hasSnapshot: boolean;
  showLedger: boolean;
  showRoster: boolean;
  showAutodraft: boolean;
}) {
  if (!args.hasSnapshot) return "1fr";
  const cols: string[] = [];
  if (args.showLedger) cols.push("320px");
  cols.push("1fr");
  if (args.showRoster) cols.push("320px");
  if (args.showAutodraft) cols.push("280px");
  return cols.join(" ");
}
