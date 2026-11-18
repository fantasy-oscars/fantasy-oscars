import { Link } from "react-router-dom";
import { Button, Divider, Stack, Text, Title } from "@ui";
import type { CircuitStandingsView } from "@/orchestration/circuitStandings";
import { circuitCeremonyPointsPath, circuitLeaguePath } from "@/lib/routes";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import { CircuitCeremonyPointsList } from "@/features/circuitLeagues/ui/CircuitCeremonyPointsList";
import { CircuitStandingsList } from "@/features/circuitLeagues/ui/CircuitStandingsList";

export function CircuitStandingsScreen(props: {
  view: CircuitStandingsView;
  viewerUserId: number | null;
}) {
  const { view } = props;
  if (view.state === "loading") return <CircuitPageSkeleton label="Loading standings" />;
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
          <Stack gap="sm" component="section" aria-labelledby="circuit-standings-title">
            <Title order={3} variant="section" id="circuit-standings-title">
              Leaderboard
            </Title>
            <Divider />
            <CircuitStandingsList
              rows={view.standings.standings}
              viewerUserId={props.viewerUserId}
              label="Standings"
            />
          </Stack>
          <Stack gap="sm" component="section" aria-labelledby="circuit-ceremonies-title">
            <Title order={3} variant="section" id="circuit-ceremonies-title">
              By ceremony
            </Title>
            <Divider />
            <CircuitCeremonyPointsList
              ceremonies={view.standings.ceremonies}
              pathOf={(ceremonyId) => circuitCeremonyPointsPath({ ...link, ceremonyId })}
            />
          </Stack>
        </>
      )}
    </CircuitPageFrame>
  );
}
