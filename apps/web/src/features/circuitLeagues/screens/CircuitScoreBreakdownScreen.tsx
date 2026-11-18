import { Link } from "react-router-dom";
import { Button } from "@ui";
import type { CircuitCeremonyBreakdownView } from "@/orchestration/circuitStandings";
import { circuitStandingsPath } from "@/lib/routes";
import {
  circuitCeremonyDatesLabel,
  circuitCeremonyName
} from "@/decisions/circuitStandings";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import { CircuitScoreBreakdown } from "@/features/circuitLeagues/ui/CircuitScoreBreakdown";

export function CircuitScoreBreakdownScreen(props: {
  view: CircuitCeremonyBreakdownView;
  viewerUserId: number | null;
}) {
  const { view } = props;
  if (view.state === "loading") return <CircuitPageSkeleton label="Loading points" />;
  if (view.state === "error") {
    return (
      <CircuitPageError
        title="Points"
        notFound={view.notFound}
        message={view.message}
        requestId={view.requestId}
      />
    );
  }
  const { detail, breakdown } = view;
  const link = {
    leagueId: detail.league.id,
    leagueName: detail.league.name,
    circuitLeagueId: detail.circuit_league.id
  };
  return (
    <CircuitPageFrame
      title={circuitCeremonyName(breakdown.ceremony)}
      subtitle={`${breakdown.ceremony.event.name} · ${circuitCeremonyDatesLabel(breakdown.ceremony)}`}
      actions={
        <Button component={Link} to={circuitStandingsPath(link)} variant="outline">
          Back to standings
        </Button>
      }
    >
      <CircuitScoreBreakdown
        standings={breakdown.standings}
        viewerUserId={props.viewerUserId}
      />
    </CircuitPageFrame>
  );
}
