import { Box, Divider, Group, Stack, Text, Title } from "@ui";
import { circuitInstantLabel } from "@/decisions/circuitRoster";
import {
  circuitWindowLabel,
  type CircuitPriorityAfterEntry,
  type CircuitWaiverResultRow
} from "@/decisions/circuitWaivers";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { CircuitWaiverRun } from "@/lib/types";
import { PlayerName } from "@/shared/PlayerName";
import { MovesStack, contenderMoves } from "@/features/circuitLeagues/ui/MovesStack";

type OpenCard = ((view: ContenderPillView) => void) | undefined;

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
      className={[
        "season-list",
        "fo-listReset",
        "fo-pillScope",
        "circuit-resultList"
      ].join(" ")}
      aria-label={`Claims for ${circuitWindowLabel(props.window)}, in the order they ran`}
    >
      {rows.map((row) => (
        <Box
          key={row.key}
          component="li"
          className={["season-row", "circuit-resultRow"].join(" ")}
        >
          <Text component="span" variant="meta" className="circuit-resultOrder">
            {row.order}.
          </Text>
          <Box className="circuit-resultWho">
            <PlayerName name={row.username} avatarKey={row.avatarKey} density="dense" />
            <Text component="span" variant="meta" className="circuit-resultOutcome">
              {row.outcome}
            </Text>
          </Box>
          <Box className="circuit-resultMoves">
            <MovesStack
              moves={contenderMoves(
                [
                  { kind: row.pillMove, view: row.pill },
                  { kind: row.dropMove, view: row.drop }
                ],
                props.onOpenCard
              )}
            />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** "Priority after:" then the members in their new order, avatar and name each. */
function PriorityAfter(props: { entries: CircuitPriorityAfterEntry[] }) {
  if (props.entries.length === 0) return null;
  return (
    <Box className="circuit-priorityAfter">
      <Text component="span" variant="meta">
        Priority after:
      </Text>
      <Box
        component="ol"
        className={["fo-listReset", "circuit-priorityAfterList"].join(" ")}
        aria-label="Priority after this run"
      >
        {props.entries.map((entry) => (
          <li key={entry.user_id}>
            <PlayerName
              name={entry.username}
              avatarKey={entry.avatarKey}
              density="dense"
            />
          </li>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Each completed run, newest first: every claim in the order it ran, who
 * made it with the outcome beside them, its moves stacked below, and
 * priority after the run as an ordered list of players.
 */
export function CircuitWaiverResults(props: {
  runs: Array<{
    run: CircuitWaiverRun;
    rows: CircuitWaiverResultRow[];
    priorityAfter: CircuitPriorityAfterEntry[];
  }>;
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
        runs.map(({ run, rows, priorityAfter }) => (
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
            <PriorityAfter entries={priorityAfter} />
          </Stack>
        ))
      )}
    </Stack>
  );
}
