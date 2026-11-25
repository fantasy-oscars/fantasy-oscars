import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Box, Button, SegmentedControl, Text, Title, VisuallyHidden } from "@ui";
import { useMediaQuery } from "@ui/hooks";
import type {
  CircuitFinalResultsView,
  CircuitStandingsView
} from "@/orchestration/circuitStandings";
import {
  circuitFinalRosterCards,
  circuitScoringContenderRows
} from "@/decisions/circuitPoints";
import {
  circuitStandingsViews,
  parseCircuitStandingsView,
  type CircuitStandingsViewKey
} from "@/decisions/circuitStandings";
import { contenderPillView } from "@/decisions/contenderPill";
import type { CircuitSelectionSummary, CircuitStandingRow } from "@/lib/types";
import { FO_BP_MOBILE_MAX_PX } from "@/tokens/breakpoints";
import { circuitCeremonyPointsPath, circuitLeaguePath } from "@/lib/routes";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import { CircuitCeremonyPointsList } from "@/features/circuitLeagues/ui/CircuitCeremonyPointsList";
import { CircuitStandingsList } from "@/features/circuitLeagues/ui/CircuitStandingsList";
import {
  CircuitFinalResults,
  type CircuitFinalResultsMode
} from "@/features/circuitLeagues/ui/CircuitFinalResults";
import {
  ContenderCardModal,
  type ContenderCardContent
} from "@/features/circuitLeagues/ui/ContenderCardModal";

function finalResultsState(
  results: CircuitFinalResultsView,
  standings: CircuitStandingRow[]
) {
  if (results.state !== "ready") return results;
  return {
    state: "ready" as const,
    contenders: circuitScoringContenderRows(results.contenders),
    rosters: circuitFinalRosterCards(results.rosters, standings)
  };
}

/** A view's heading: hidden, since the switch shows which view is on. */
function ViewHeading(props: { id: string; children: string }) {
  return (
    <VisuallyHidden>
      <Title order={3} id={props.id}>
        {props.children}
      </Title>
    </VisuallyHidden>
  );
}

/**
 * Standings: the leaderboard, the final results (once the season is
 * complete) and the points by ceremony, one view at a time behind a switch
 * whose choice lives in the URL.
 */
export function CircuitStandingsScreen(props: {
  view: CircuitStandingsView;
  viewerUserId: number | null;
  /** The raw `?view=` value. */
  viewParam: string | null;
  onViewChange: (view: CircuitStandingsViewKey) => void;
  resultsMode: CircuitFinalResultsMode;
  onResultsModeChange: (mode: CircuitFinalResultsMode) => void;
}) {
  const { view } = props;
  const isMobile = useMediaQuery(`(max-width: ${FO_BP_MOBILE_MAX_PX}px)`);
  const coarse = useMediaQuery("(pointer: coarse)");
  const [card, setCard] = useState<ContenderCardContent | null>(null);
  const categories = view.state === "ready" ? view.detail.categories : null;
  const viewOf = useMemo(
    () => (selection: CircuitSelectionSummary) =>
      contenderPillView(selection, categories ?? []),
    [categories]
  );
  if (view.state === "loading") {
    return <CircuitPageSkeleton label="Loading standings" withSwitch rows={5} />;
  }
  if (view.state === "error") {
    return (
      <CircuitPageError
        title="Standings"
        notFound={view.notFound}
        message={view.message}
        requestId={view.requestId}
      />
    );
  }
  const { detail } = view;
  const complete = detail.circuit_league.status === "COMPLETE";
  const current = parseCircuitStandingsView(props.viewParam, complete);
  const link = {
    leagueId: detail.league.id,
    leagueName: detail.league.name,
    circuitLeagueId: detail.circuit_league.id
  };
  return (
    <CircuitPageFrame
      title="Standings"
      subtitle={`${detail.circuit?.name ?? "Season"} · ${detail.league.name}`}
      actions={
        <Button component={Link} to={circuitLeaguePath(link)} variant="outline">
          Back to season
        </Button>
      }
    >
      {view.state === "not-started" ? (
        <Text className="baseline-textBody">
          Standings start once the draft has finished.
        </Text>
      ) : (
        <>
          <Box>
            <SegmentedControl
              aria-label="Show standings"
              className={["circuit-boardToggle", "circuit-viewSwitch"].join(" ")}
              value={current}
              fullWidth={isMobile}
              onChange={(v: string) =>
                props.onViewChange(parseCircuitStandingsView(v, complete))
              }
              data={circuitStandingsViews(complete)}
            />
          </Box>
          {current === "results" && view.finalResults ? (
            <CircuitFinalResults
              mode={props.resultsMode}
              onModeChange={props.onResultsModeChange}
              state={finalResultsState(view.finalResults, view.standings.standings)}
              viewerUserId={props.viewerUserId}
              viewOf={viewOf}
              onOpenCard={isMobile || coarse ? setCard : undefined}
              phone={isMobile}
            />
          ) : current === "ceremonies" ? (
            <Box component="section" aria-labelledby="circuit-ceremonies-title">
              <ViewHeading id="circuit-ceremonies-title">By ceremony</ViewHeading>
              <CircuitCeremonyPointsList
                ceremonies={view.standings.ceremonies}
                pathOf={(ceremonyId) =>
                  circuitCeremonyPointsPath({ ...link, ceremonyId })
                }
              />
            </Box>
          ) : (
            <Box component="section" aria-labelledby="circuit-standings-title">
              <ViewHeading id="circuit-standings-title">Leaderboard</ViewHeading>
              <CircuitStandingsList
                rows={view.standings.standings}
                viewerUserId={props.viewerUserId}
                label="Standings"
              />
            </Box>
          )}
          <ContenderCardModal card={card} onClose={() => setCard(null)} />
        </>
      )}
    </CircuitPageFrame>
  );
}
