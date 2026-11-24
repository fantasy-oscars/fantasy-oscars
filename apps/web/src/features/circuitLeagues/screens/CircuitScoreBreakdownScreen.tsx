import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, SegmentedControl, Stack, Text } from "@ui";
import { useMediaQuery } from "@ui/hooks";
import type { CircuitCeremonyBreakdownView } from "@/orchestration/circuitStandings";
import { circuitStandingsPath } from "@/lib/routes";
import {
  circuitCeremonyDatesLabel,
  circuitCeremonyName
} from "@/decisions/circuitStandings";
import {
  circuitCeremonyPointsByCategory,
  circuitCeremonyPointsByPlayer
} from "@/decisions/circuitPoints";
import { contenderPillView } from "@/decisions/contenderPill";
import type { CircuitSelectionSummary } from "@/lib/types";
import { FO_BP_MOBILE_MAX_PX } from "@/tokens/breakpoints";
import {
  CircuitPageError,
  CircuitPageFrame,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import {
  CircuitCeremonyPointsByCategory,
  CircuitCeremonyPointsByPlayer,
  type CircuitPointsMode
} from "@/features/circuitLeagues/ui/CircuitScoreBreakdown";
import {
  ContenderCardModal,
  type ContenderCardContent
} from "@/features/circuitLeagues/ui/ContenderCardModal";
import { useChangedFlag } from "./useChangedFlag";

const UPDATED_MS = 4000;

export function CircuitScoreBreakdownScreen(props: {
  view: CircuitCeremonyBreakdownView;
  viewerUserId: number | null;
  mode: CircuitPointsMode;
  onModeChange: (mode: CircuitPointsMode) => void;
}) {
  const { view } = props;
  const isMobile = useMediaQuery(`(max-width: ${FO_BP_MOBILE_MAX_PX}px)`);
  const coarse = useMediaQuery("(pointer: coarse)");
  const [card, setCard] = useState<ContenderCardContent | null>(null);
  const breakdown = view.state === "ready" ? view.breakdown : null;
  // A live refresh that changes the points says so for a moment, so rows that move make sense.
  const updated = useChangedFlag(breakdown, UPDATED_MS);
  const categories = view.state === "ready" ? view.detail.categories : null;
  const viewOf = useMemo(
    () => (selection: CircuitSelectionSummary) =>
      contenderPillView(selection, categories ?? []),
    [categories]
  );
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
  const { detail } = view;
  const link = {
    leagueId: detail.league.id,
    leagueName: detail.league.name,
    circuitLeagueId: detail.circuit_league.id
  };
  const openCard = isMobile || coarse ? setCard : undefined;
  return (
    <CircuitPageFrame
      title={circuitCeremonyName(view.breakdown.ceremony)}
      subtitle={`${view.breakdown.ceremony.event.name} · ${circuitCeremonyDatesLabel(view.breakdown.ceremony)}`}
      actions={
        <Button component={Link} to={circuitStandingsPath(link)} variant="outline">
          Back to standings
        </Button>
      }
    >
      <Stack gap="xs" align="flex-start">
        <SegmentedControl
          aria-label="Show points"
          className="circuit-boardToggle"
          value={props.mode}
          onChange={(v: string) =>
            props.onModeChange(v === "category" ? "category" : "player")
          }
          data={[
            { value: "player", label: "By player" },
            { value: "category", label: "By category" }
          ]}
        />
        <Text variant="helper" role="status" aria-live="polite">
          {updated ? "Points updated" : ""}
        </Text>
      </Stack>
      {props.mode === "category" ? (
        <CircuitCeremonyPointsByCategory
          rows={circuitCeremonyPointsByCategory(view.breakdown, detail.categories)}
          viewOf={viewOf}
          onOpenCard={openCard}
        />
      ) : (
        <CircuitCeremonyPointsByPlayer
          cards={circuitCeremonyPointsByPlayer(view.breakdown)}
          viewerUserId={props.viewerUserId}
          viewOf={viewOf}
          onOpenCard={openCard}
        />
      )}
      <ContenderCardModal card={card} onClose={() => setCard(null)} />
    </CircuitPageFrame>
  );
}
