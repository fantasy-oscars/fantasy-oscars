import { Box, Divider, Group, SegmentedControl, Skeleton, Stack, Text, Title } from "@ui";
import type {
  CircuitPlayerPointsCard,
  CircuitScoringContenderRow
} from "@/decisions/circuitPoints";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { CircuitSelectionSummary } from "@/lib/types";
import { FormStatus } from "@/shared/forms";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { CircuitPointsPill, type CircuitPointsCardOpener } from "./CircuitPointsPill";
import { CircuitCeremonyPointsByPlayer } from "./CircuitScoreBreakdown";

export type CircuitFinalResultsMode = "contenders" | "rosters";

type ViewOf = (selection: CircuitSelectionSummary) => ContenderPillView;

/**
 * All scoring contenders: one row per contender that scored, by season
 * total, with the players it scored for. The rows add up to the
 * leaderboard's total.
 */
function ScoringContenders(props: {
  rows: CircuitScoringContenderRow[];
  viewOf: ViewOf;
  onOpenCard?: CircuitPointsCardOpener;
}) {
  if (props.rows.length === 0) {
    return <Text className="baseline-textBody">Nothing scored this season.</Text>;
  }
  return (
    <Box
      component="ol"
      className={["fo-listReset", "fo-pillScope", "circuit-contenderList"].join(" ")}
      aria-label="All scoring contenders"
    >
      {props.rows.map((row) => (
        <Box key={row.pill.key} component="li" className="circuit-contenderRow">
          <Text component="span" variant="meta" className="circuit-contenderRank">
            {row.rank}
          </Text>
          <Box className="circuit-contenderPill">
            <CircuitPointsPill
              pill={row.pill}
              view={props.viewOf(row.pill.selection)}
              onOpenCard={props.onOpenCard}
            />
          </Box>
          <Box
            component="ul"
            className={["fo-listReset", "circuit-contenderPlayers"].join(" ")}
          >
            {row.players.map((player) => (
              <Box key={player.userId} component="li" className="circuit-pointsPlayer">
                <AnimalAvatarIcon avatarKey={player.avatarKey} size="sm" />
                {/* Only the name ellipsises; the points always show. */}
                <Text
                  component="span"
                  className="circuit-pointsPlayerName"
                  title={`${player.username} ${player.pointsLabel}`}
                >
                  {player.username}
                </Text>{" "}
                <Text component="span" className="circuit-pointsPlayerPoints">
                  {player.pointsLabel}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/**
 * The season's final results, once it is complete: every contender that
 * scored, or every player's final roster, behind one switch.
 */
export function CircuitFinalResults(props: {
  mode: CircuitFinalResultsMode;
  onModeChange: (mode: CircuitFinalResultsMode) => void;
  state:
    | { state: "loading" }
    | { state: "error"; message: string }
    | {
        state: "ready";
        contenders: CircuitScoringContenderRow[];
        rosters: CircuitPlayerPointsCard[];
      };
  viewerUserId: number | null;
  viewOf: ViewOf;
  onOpenCard?: CircuitPointsCardOpener;
}) {
  const { state } = props;
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-final-title">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Title order={3} variant="section" id="circuit-final-title">
          Final results
        </Title>
        <SegmentedControl
          aria-label="Show final results"
          className="circuit-boardToggle"
          value={props.mode}
          onChange={(v: string) =>
            props.onModeChange(v === "rosters" ? "rosters" : "contenders")
          }
          data={[
            { value: "contenders", label: "All scoring contenders" },
            { value: "rosters", label: "Final rosters" }
          ]}
        />
      </Group>
      <Divider />
      {state.state === "loading" ? (
        <Stack gap="sm" role="status" aria-label="Loading results">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} height="var(--fo-font-size-sm)" width="72%" />
          ))}
        </Stack>
      ) : state.state === "error" ? (
        <FormStatus loading={false} result={{ ok: false, message: state.message }} />
      ) : props.mode === "rosters" ? (
        <CircuitCeremonyPointsByPlayer
          cards={state.rosters}
          viewerUserId={props.viewerUserId}
          viewOf={props.viewOf}
          onOpenCard={props.onOpenCard}
          label="Final rosters"
          emptyText="No picks."
        />
      ) : (
        <ScoringContenders
          rows={state.contenders}
          viewOf={props.viewOf}
          onOpenCard={props.onOpenCard}
        />
      )}
    </Stack>
  );
}
