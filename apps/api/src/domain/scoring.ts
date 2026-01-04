export type DraftPick = {
  pick_number: number;
  seat_number: number;
  nomination_id: string;
};

export type NominationResult = {
  nomination_id: string;
  won: boolean;
  points?: number;
};

export type SeatScore = {
  seat_number: number;
  points: number;
};

export interface ScoringStrategy {
  score(input: { picks: DraftPick[]; results: NominationResult[] }): SeatScore[];
}

export class ScoringError extends Error {
  constructor(
    message: string,
    public code: "INVALID_INPUT"
  ) {
    super(message);
    this.name = "ScoringError";
  }
}

/**
  Entrypoint for scoring picks. Delegates to a pluggable strategy so callers stay stable
  while strategies can change.
*/
export function scoreDraft(input: {
  picks: DraftPick[];
  results: NominationResult[];
  strategy?: ScoringStrategy;
}): SeatScore[] {
  if (!Array.isArray(input.picks) || !Array.isArray(input.results)) {
    throw new ScoringError("Picks and results must be arrays", "INVALID_INPUT");
  }
  const strategy = input.strategy ?? defaultScoringStrategy;
  return strategy.score({ picks: input.picks, results: input.results });
}

export const defaultScoringStrategy: ScoringStrategy = {
  score: ({ picks, results }) => {
    const winners = new Set(results.filter((r) => r.won).map((r) => r.nomination_id));

    const pointsBySeat = new Map<number, number>();
    for (const pick of picks) {
      if (!pointsBySeat.has(pick.seat_number)) {
        pointsBySeat.set(pick.seat_number, 0);
      }
      if (!winners.has(pick.nomination_id)) continue;
      pointsBySeat.set(pick.seat_number, (pointsBySeat.get(pick.seat_number) ?? 0) + 1);
    }

    return [...pointsBySeat.entries()]
      .map(([seat_number, points]) => ({ seat_number, points }))
      .sort((a, b) => a.seat_number - b.seat_number);
  }
};
