import type { CircuitPointsPill as PointsPill } from "@/decisions/circuitPoints";
import type { ContenderPillView } from "@/decisions/contenderPill";
import { ContenderPill } from "./ContenderPill";
import { ContenderNomineeCard, type ContenderCardContent } from "./ContenderCardModal";

/** What a tap on a points pill opens on a phone: the card with its points section. */
export type CircuitPointsCardOpener = (card: ContenderCardContent) => void;

/**
 * A pill in a points view: its figure, gold when it won in the view's scope,
 * dashed for a pick the player has dropped since (no caption: the card says
 * "Dropped since" with the date, and the accessible name says "dropped"), and
 * the nominee card with the points section on hover, focus or (phone) a tap.
 */
export function CircuitPointsPill(props: {
  pill: PointsPill;
  view: ContenderPillView;
  onOpenCard?: CircuitPointsCardOpener;
}) {
  const { pill, view, onOpenCard } = props;
  return (
    <ContenderPill
      label={view.label}
      categoryName={view.categoryName}
      iconCode={view.iconCode}
      iconVariant={view.iconVariant}
      points={pill.points}
      pointsLabel={pill.pointsLabel}
      winner={pill.winner}
      state={pill.dropped ? "dropped" : "default"}
      stateSuffix={pill.dropped ? "dropped" : null}
      tooltip={
        <ContenderNomineeCard tooltip={view.tooltip} pointsSection={pill.pointsSection} />
      }
      onOpenCard={
        onOpenCard
          ? () =>
              onOpenCard({
                tooltip: view.tooltip,
                pointsSection: pill.pointsSection,
                actions: []
              })
          : undefined
      }
    />
  );
}
