import type { Snapshot } from "../lib/types";

export type SeatStanding = { seat: number; points: number };
export type PickWithResult = Snapshot["picks"][number] & { isWinner: boolean };

export function computeStandings(snapshot: Snapshot, winnerNominationIds: Set<number>) {
  const seatScores: Record<number, SeatStanding> = {};
  for (const seat of snapshot.seats) {
    seatScores[seat.seat_number] = { seat: seat.seat_number, points: 0 };
  }
  for (const pick of snapshot.picks) {
    if (winnerNominationIds.has(pick.nomination_id)) {
      seatScores[pick.seat_number].points += 1;
    }
  }
  return Object.values(seatScores).sort((a, b) => b.points - a.points);
}

export function buildPicksWithResult(
  snapshot: Snapshot,
  winnerNominationIds: Set<number>
) {
  return snapshot.picks
    .slice()
    .sort((a, b) => a.pick_number - b.pick_number)
    .map((p) => ({ ...p, isWinner: winnerNominationIds.has(p.nomination_id) }));
}
