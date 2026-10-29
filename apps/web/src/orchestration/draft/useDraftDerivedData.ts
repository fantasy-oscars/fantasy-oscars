import { useMemo } from "react";
import type { Snapshot } from "../../lib/types";
import {
  buildDraftedSet,
  buildIconByCategoryId,
  buildNominationsByCategoryId,
  buildNominationIconById,
  buildNominationLabelById
} from "../../decisions/draft";
import {
  buildCategoryWeightByCategoryId,
  buildPointsByNominationId,
  buildSeatScoreBySeatNumber,
  buildWinnerCountBySeat,
  buildWinnerSet,
  computeResultsPodium,
  computeResultsWinnerLabel
} from "../../decisions/draft/scoring";

/** Lookup tables, scoring and final-results standings derived from the snapshot. */
export function useDraftDerivedData(snapshot: Snapshot | null) {
  const drafted = useMemo(
    () => buildDraftedSet(snapshot?.picks ?? []),
    [snapshot?.picks]
  );
  const winnerSet = useMemo(() => buildWinnerSet(snapshot?.winners), [snapshot?.winners]);
  const winnerCountBySeat = useMemo(
    () => buildWinnerCountBySeat(snapshot, winnerSet),
    [snapshot, winnerSet]
  );
  const nominationLabelById = useMemo(
    () => buildNominationLabelById(snapshot),
    [snapshot]
  );
  const nominationIconById = useMemo(() => buildNominationIconById(snapshot), [snapshot]);
  const iconByCategoryId = useMemo(() => buildIconByCategoryId(snapshot), [snapshot]);
  const nominationsByCategoryId = useMemo(
    () => buildNominationsByCategoryId(snapshot),
    [snapshot]
  );

  const ceremonyStatus = snapshot?.ceremony_status ?? null;
  const scoringStrategyName = snapshot?.scoring_strategy_name ?? "fixed";
  const isFinalResults =
    (snapshot?.draft.status ?? null) === "COMPLETED" && ceremonyStatus === "COMPLETE";

  const categoryWeightByCategoryId = useMemo(
    () => buildCategoryWeightByCategoryId(snapshot?.category_weights),
    [snapshot?.category_weights]
  );

  const pointsForNominationId = useMemo(
    () =>
      buildPointsByNominationId({
        snapshot,
        scoringStrategyName,
        categoryWeightByCategoryId
      }),
    [categoryWeightByCategoryId, scoringStrategyName, snapshot]
  );

  const seatScoreBySeatNumber = useMemo(
    () => buildSeatScoreBySeatNumber({ snapshot, winnerSet, pointsForNominationId }),
    [pointsForNominationId, snapshot, winnerSet]
  );

  const resultsPodium = useMemo(
    () =>
      computeResultsPodium({
        snapshot,
        isFinalResults,
        scoringStrategyName,
        seatScoreBySeatNumber,
        winnerCountBySeat
      }),
    [
      isFinalResults,
      scoringStrategyName,
      seatScoreBySeatNumber,
      snapshot,
      winnerCountBySeat
    ]
  );

  const resultsWinnerLabel = useMemo(
    () => computeResultsWinnerLabel({ isFinalResults, resultsPodium }),
    [isFinalResults, resultsPodium]
  );

  return {
    drafted,
    winnerSet,
    winnerCountBySeat,
    nominationLabelById,
    nominationIconById,
    iconByCategoryId,
    nominationsByCategoryId,
    ceremonyStatus,
    scoringStrategyName,
    isFinalResults,
    categoryWeightByCategoryId,
    pointsForNominationId,
    seatScoreBySeatNumber,
    resultsPodium,
    resultsWinnerLabel
  };
}

export type DraftDerivedData = ReturnType<typeof useDraftDerivedData>;
