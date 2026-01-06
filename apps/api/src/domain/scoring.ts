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
  strategyName?: ScoringStrategyName;
}): SeatScore[] {
  if (!Array.isArray(input.picks) || !Array.isArray(input.results)) {
    throw new ScoringError("Picks and results must be arrays", "INVALID_INPUT");
  }
  const strategy =
    input.strategy ??
    (input.strategyName
      ? resolveScoringStrategy(input.strategyName)
      : defaultScoringStrategy);
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

/**
 * Optional alternate strategy: +1 for winning picks, -1 for non-winning picks.
 * If results provide a `points` value, winners earn that amount and non-winners lose it.
 */
export const negativeScoringStrategy: ScoringStrategy = {
  score: ({ picks, results }) => {
    const resultByNomination = new Map(
      results.map((r) => [r.nomination_id, { won: r.won, points: r.points ?? 1 }])
    );
    const pointsBySeat = new Map<number, number>();

    for (const pick of picks) {
      const result = resultByNomination.get(pick.nomination_id);
      const magnitude = result?.points ?? 1;
      const delta = result?.won ? magnitude : -magnitude;
      pointsBySeat.set(
        pick.seat_number,
        (pointsBySeat.get(pick.seat_number) ?? 0) + delta
      );
    }

    return [...pointsBySeat.entries()]
      .map(([seat_number, points]) => ({ seat_number, points }))
      .sort((a, b) => a.seat_number - b.seat_number);
  }
};

export type ScoringStrategyName = "fixed" | "negative";

export const scoringStrategies: Record<ScoringStrategyName, ScoringStrategy> = {
  fixed: defaultScoringStrategy,
  negative: negativeScoringStrategy
};

export function resolveScoringStrategy(name?: ScoringStrategyName): ScoringStrategy {
  if (!name) return defaultScoringStrategy;
  return scoringStrategies[name] ?? defaultScoringStrategy;
}
