import { useMemo } from "react";
import type { Snapshot } from "../../lib/types";
import {
  buildPicksByNumber,
  buildPicksBySeat,
  getMaxPicksForSeats,
  type DraftTurn
} from "../../decisions/draft";
import {
  buildLedgerRows,
  buildMyPicks,
  buildRosterRowsBySeat
} from "../../decisions/draft/boards";
import { buildPoolCategories } from "../../decisions/draft/pool";
import type { DraftDerivedData } from "./useDraftDerivedData";

/** Ledger, pool, roster and header-participant view data for the draft room. */
export function useDraftBoards(args: {
  snapshot: Snapshot | null;
  turn: DraftTurn | null;
  mySeatNumber: number | null;
  selectedNominationId: number | null;
  derived: DraftDerivedData;
}) {
  const { snapshot, turn, mySeatNumber, selectedNominationId, derived } = args;
  const {
    drafted,
    winnerSet,
    nominationLabelById,
    nominationIconById,
    iconByCategoryId,
    nominationsByCategoryId,
    scoringStrategyName,
    categoryWeightByCategoryId
  } = derived;

  const picksByNumber = useMemo(
    () => (snapshot ? buildPicksByNumber(snapshot) : null),
    [snapshot]
  );

  const ledgerRows = useMemo(
    () =>
      buildLedgerRows({
        snapshot,
        picksByNumber,
        turn,
        nominationLabelById,
        nominationIconById,
        winnerSet
      }),
    [nominationIconById, nominationLabelById, picksByNumber, snapshot, turn, winnerSet]
  );

  const poolCategories = useMemo(
    () =>
      buildPoolCategories({
        snapshot,
        drafted,
        winnerSet,
        selectedNominationId,
        scoringStrategyName,
        categoryWeightByCategoryId,
        iconByCategoryId,
        nominationsByCategoryId
      }),
    [
      drafted,
      categoryWeightByCategoryId,
      iconByCategoryId,
      nominationsByCategoryId,
      selectedNominationId,
      scoringStrategyName,
      snapshot,
      winnerSet
    ]
  );

  const myPicks = useMemo(
    () =>
      buildMyPicks({
        snapshot,
        mySeatNumber,
        nominationLabelById,
        nominationIconById,
        winnerSet
      }),
    [mySeatNumber, nominationIconById, nominationLabelById, snapshot, winnerSet]
  );

  const selected = useMemo(() => {
    if (!selectedNominationId) return null;
    return {
      id: selectedNominationId,
      icon: nominationIconById.get(selectedNominationId) ?? null,
      label: nominationLabelById.get(selectedNominationId) ?? "Unnamed nomination"
    };
  }, [nominationIconById, nominationLabelById, selectedNominationId]);

  const rosterPicksBySeat = useMemo(
    () =>
      buildRosterRowsBySeat({
        snapshot,
        nominationLabelById,
        nominationIconById,
        winnerSet
      }),
    [nominationIconById, nominationLabelById, snapshot, winnerSet]
  );

  const maxRows = useMemo(() => {
    if (!snapshot) return 0;
    const raw = buildPicksBySeat(snapshot);
    return getMaxPicksForSeats(snapshot.seats, raw);
  }, [snapshot]);

  const participants = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.seats.map((s) => ({
      seatNumber: s.seat_number,
      label: s.username ?? `Seat ${s.seat_number}`,
      active: turn?.seat_number === s.seat_number,
      avatarKey: s.avatar_key ?? null,
      userId: s.user_id ?? null
    }));
  }, [snapshot, turn?.seat_number]);

  return {
    ledgerRows,
    poolCategories,
    myPicks,
    selected,
    rosterPicksBySeat,
    maxRows,
    participants
  };
}
