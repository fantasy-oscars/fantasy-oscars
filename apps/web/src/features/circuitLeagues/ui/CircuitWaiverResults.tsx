import { Box, Divider, Group, Stack, Text, Title } from "@ui";
import { circuitInstantLabel } from "@/decisions/circuitRoster";
import {
  circuitWindowLabel,
  type CircuitWaiverResultRow
} from "@/decisions/circuitWaivers";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { CircuitWaiverRun } from "@/lib/types";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { ContenderPill } from "@/features/circuitLeagues/ui/ContenderPill";
import { ContenderNomineeCard } from "@/features/circuitLeagues/ui/ContenderCardModal";

type OpenCard = ((view: ContenderPillView) => void) | undefined;

function ResultPill(props: {
  view: ContenderPillView;
  state: "default" | "muted" | "dropped";
  stateSuffix: string | null;
  onOpenCard: OpenCard;
}) {
  const { view, onOpenCard } = props;
  return (
    <ContenderPill
      label={view.label}
      categoryName={view.categoryName}
      iconCode={view.iconCode}
      iconVariant={view.iconVariant}
      state={props.state}
      stateSuffix={props.stateSuffix}
      tooltip={<ContenderNomineeCard tooltip={view.tooltip} />}
      onOpenCard={onOpenCard ? () => onOpenCard(view) : undefined}
    />
  );
}

function RunClaims(props: {
  window: CircuitWaiverRun["window"];
  rows: CircuitWaiverResultRow[];
  onOpenCard: OpenCard;
}) {
  const { rows } = props;
  if (rows.length === 0) {
    return <Text className="baseline-textBody">Nobody made a claim.</Text>;
  }
  return (
    <Box
      component="ol"
      className={["fo-listReset", "fo-pillScope", "circuit-resultList"].join(" ")}
      aria-label={`Claims for ${circuitWindowLabel(props.window)}, in the order they ran`}
    >
      {rows.map((row) => (
        <Box key={row.key} component="li" className="circuit-resultRow">
          <Box className="circuit-resultWho">
            <Text component="span" variant="meta" className="circuit-resultOrder">
              {row.order}.
            </Text>
            <AnimalAvatarIcon avatarKey={row.avatarKey} size="sm" />
            <Text component="span" className="circuit-txName" title={row.username}>
              {row.username}
            </Text>
            <Text component="span" variant="meta" className="circuit-resultOutcome">
              {row.outcome}
            </Text>
          </Box>
          <Box className="circuit-txMoves">
            <ResultPill
              view={row.pill}
              state={row.won ? "default" : "muted"}
              stateSuffix={row.won ? null : "lost"}
              onOpenCard={props.onOpenCard}
            />
            {row.drop ? (
              <Box component="span" className="circuit-txMove">
                <Text component="span" className="dr-pill-caption">
                  dropping
                </Text>
                <ResultPill
                  view={row.drop}
                  state="dropped"
                  stateSuffix="dropped"
                  onOpenCard={props.onOpenCard}
                />
              </Box>
            ) : null}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Each completed run, newest first: every claim in the order it ran, who
 * made it with the outcome beside them, the claimed and dropped contenders
 * as pills, and priority after the run.
 */
export function CircuitWaiverResults(props: {
  runs: Array<{ run: CircuitWaiverRun; rows: CircuitWaiverResultRow[] }>;
  /** Phone or coarse pointer: a tap on a pill opens its nominee card. */
  onOpenCard?: (view: ContenderPillView) => void;
}) {
  const { runs } = props;
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-results-title">
      <Title order={3} variant="section" id="circuit-results-title">
        Results
      </Title>
      <Divider />
      {runs.length === 0 ? (
        <Text className="baseline-textBody">
          No claims have run yet. Results appear here after each window.
        </Text>
      ) : (
        runs.map(({ run, rows }) => (
          <Stack
            key={run.id}
            gap="xs"
            component="section"
            aria-labelledby={`circuit-run-${run.id}`}
          >
            <Group justify="space-between" align="baseline" wrap="wrap" gap="sm">
              <Title order={4} variant="section" id={`circuit-run-${run.id}`}>
                {circuitWindowLabel(run.window)}
              </Title>
              <Text variant="meta">
                Ran{" "}
                <time dateTime={run.completed_at}>
                  {circuitInstantLabel(run.completed_at)}
                </time>
              </Text>
            </Group>
            <RunClaims window={run.window} rows={rows} onOpenCard={props.onOpenCard} />
            {run.priority_after.length > 0 ? (
              <Text variant="helper">
                Priority after: {run.priority_after.map((p) => p.username).join(", ")}
              </Text>
            ) : null}
          </Stack>
        ))
      )}
    </Stack>
  );
}
