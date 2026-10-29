import type { Snapshot } from "../../lib/types";

export type PodiumEntry = { place: 1 | 2 | 3; names: string[] };

export function buildWinnerSet(winners: Snapshot["winners"] | undefined) {
  const set = new Set<number>();
  for (const w of winners ?? []) set.add(w.nomination_id);
  return set;
}

export function buildWinnerCountBySeat(
  snapshot: Snapshot | null,
  winnerSet: Set<number>
) {
  const m = new Map<number, number>();
  if (!snapshot) return m;
  for (const s of snapshot.seats) m.set(s.seat_number, 0);
  for (const p of snapshot.picks) {
    if (!winnerSet.has(p.nomination_id)) continue;
    m.set(p.seat_number, (m.get(p.seat_number) ?? 0) + 1);
  }
  return m;
}

export function buildCategoryWeightByCategoryId(raw: Snapshot["category_weights"]) {
  const m = new Map<number, number>();
  if (!raw || typeof raw !== "object") return m;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k);
    const n = Number(v);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!Number.isInteger(n) || n < -99 || n > 99) continue;
    m.set(id, n);
  }
  return m;
}

export function buildPointsByNominationId(args: {
  snapshot: Snapshot | null;
  scoringStrategyName: string;
  categoryWeightByCategoryId: Map<number, number>;
}) {
  const { snapshot, scoringStrategyName, categoryWeightByCategoryId } = args;
  const m = new Map<number, number>();
  if (!snapshot) return m;
  const nominations = snapshot.nominations ?? [];
  for (const n of nominations) {
    const nominationId = Number(n.id);
    const categoryId = Number(n.category_edition_id);
    if (!Number.isFinite(nominationId) || !Number.isFinite(categoryId)) continue;
    if (scoringStrategyName === "category_weighted") {
      m.set(nominationId, categoryWeightByCategoryId.get(categoryId) ?? 1);
    } else {
      m.set(nominationId, 1);
    }
  }
  return m;
}

export function buildSeatScoreBySeatNumber(args: {
  snapshot: Snapshot | null;
  winnerSet: Set<number>;
  pointsForNominationId: Map<number, number>;
}) {
  const { snapshot, winnerSet, pointsForNominationId } = args;
  const m = new Map<number, number>();
  if (!snapshot) return m;
  for (const s of snapshot.seats) m.set(s.seat_number, 0);
  for (const p of snapshot.picks) {
    if (!winnerSet.has(p.nomination_id)) continue;
    const delta = pointsForNominationId.get(p.nomination_id) ?? 1;
    m.set(p.seat_number, (m.get(p.seat_number) ?? 0) + delta);
  }
  return m;
}

export function computeResultsPodium(args: {
  snapshot: Snapshot | null;
  isFinalResults: boolean;
  scoringStrategyName: string;
  seatScoreBySeatNumber: Map<number, number>;
  winnerCountBySeat: Map<number, number>;
}): PodiumEntry[] {
  const {
    snapshot,
    isFinalResults,
    scoringStrategyName,
    seatScoreBySeatNumber,
    winnerCountBySeat
  } = args;
  if (!snapshot || !isFinalResults) return [];
  const scores = snapshot.seats.map((s) => ({
    seatNumber: s.seat_number,
    username: s.username ?? `Seat ${s.seat_number}`,
    score:
      scoringStrategyName === "category_weighted"
        ? (seatScoreBySeatNumber.get(s.seat_number) ?? 0)
        : (winnerCountBySeat.get(s.seat_number) ?? 0)
  }));
  if (!scores.length) return [];
  const rankScores = Array.from(new Set(scores.map((s) => s.score))).sort((a, b) =>
    scoringStrategyName === "negative" ? a - b : b - a
  );
  const topThree = rankScores.slice(0, 3);
  return topThree
    .map((score, idx) => ({
      place: (idx + 1) as 1 | 2 | 3,
      names: scores.filter((s) => s.score === score).map((s) => s.username)
    }))
    .filter((p) => p.names.length > 0);
}

export function computeResultsWinnerLabel(args: {
  isFinalResults: boolean;
  resultsPodium: PodiumEntry[];
}) {
  const firstPlace = args.resultsPodium.find((p) => p.place === 1)?.names ?? [];
  if (!args.isFinalResults || firstPlace.length === 0) return null;
  if (firstPlace.length === 1) return firstPlace[0];
  return `Tie: ${firstPlace.join(", ")}`;
}

export type RosterBoardSeat = {
  seatNumber: number;
  username: string | null;
  winnerCount: number;
  score: number;
};

/** Seats for the roster board; ordered by standing once results are final. */
export function buildRosterBoardSeats(args: {
  snapshot: Snapshot | null;
  isFinalResults: boolean;
  scoringStrategyName: string;
  winnerCountBySeat: Map<number, number>;
  seatScoreBySeatNumber: Map<number, number>;
}): RosterBoardSeat[] {
  const {
    snapshot,
    isFinalResults,
    scoringStrategyName,
    winnerCountBySeat,
    seatScoreBySeatNumber
  } = args;
  const base =
    snapshot?.seats.map((s) => ({
      seatNumber: s.seat_number,
      username: s.username ?? null,
      winnerCount: winnerCountBySeat.get(s.seat_number) ?? 0,
      score: seatScoreBySeatNumber.get(s.seat_number) ?? 0
    })) ?? [];
  if (!snapshot || !isFinalResults) return base;
  const dir = scoringStrategyName === "negative" ? 1 : -1; // negative: fewer winners wins; others: higher score wins
  return [...base].sort((a, b) => {
    const aScore = scoringStrategyName === "category_weighted" ? a.score : a.winnerCount;
    const bScore = scoringStrategyName === "category_weighted" ? b.score : b.winnerCount;
    if (aScore !== bScore) return (aScore - bScore) * dir;
    return a.seatNumber - b.seatNumber;
  });
}

/** Remaining pick-timer time in ms, clamped to the timer length; null when no live timer. */
export function computeTimerRemainingMs(snapshot: Snapshot | null, nowTs: number) {
  if (!snapshot) return null;
  const d = snapshot.draft;
  if (d.status !== "IN_PROGRESS") return null;
  if (!d.pick_timer_seconds) return null;
  if (!d.pick_deadline_at) return null;
  const deadlineMs = new Date(d.pick_deadline_at).getTime();
  if (!Number.isFinite(deadlineMs)) return null;
  const remaining = deadlineMs - nowTs;
  if (!Number.isFinite(remaining)) return null;
  const maxMs = d.pick_timer_seconds * 1000;
  const clamped = Math.min(Math.max(remaining, 0), maxMs);
  return Number.isFinite(clamped) ? clamped : null;
}
