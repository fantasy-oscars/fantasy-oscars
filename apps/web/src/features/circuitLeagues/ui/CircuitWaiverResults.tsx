import { Box, Divider, Group, Stack, Text, Title } from "@ui";
import {
  circuitInstantLabel,
  circuitSelectionCategoryLabel
} from "@/decisions/circuitRoster";
import {
  circuitChipLabel,
  circuitClaimOutcomeLabel,
  circuitWindowLabel
} from "@/decisions/circuitWaivers";
import type { CircuitWaiverRun } from "@/lib/types";

function RunClaims(props: {
  run: CircuitWaiverRun;
  categoryNames: ReadonlyMap<number, string>;
}) {
  const { run, categoryNames } = props;
  if (run.claims.length === 0) {
    return <Text className="baseline-textBody">Nobody made a claim.</Text>;
  }
  return (
    <Stack
      component="ol"
      gap="var(--fo-space-0)"
      className="fo-listReset"
      aria-label={`Claims for ${circuitWindowLabel(run.window)}, in the order they ran`}
    >
      {run.claims.map((claim, idx) => (
        <Box key={claim.id} component="li">
          <Stack gap="var(--fo-space-dense-2)" py="sm">
            <Group justify="space-between" align="baseline" wrap="wrap" gap="sm">
              <Text fw="var(--fo-font-weight-semibold)" className="baseline-wrapAnywhere">
                {claim.order}. {claim.member.username}
              </Text>
              <Text variant="meta">
                {[
                  circuitClaimOutcomeLabel(claim),
                  claim.chip ? circuitChipLabel(claim.chip.original_pick_number) : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </Group>
            <Text className="baseline-textBody baseline-wrapAnywhere">
              Claimed {circuitSelectionCategoryLabel(claim.selection, categoryNames)}
              {claim.drop
                ? `, dropping ${circuitSelectionCategoryLabel(claim.drop, categoryNames)}`
                : ""}
            </Text>
          </Stack>
          {idx === run.claims.length - 1 ? null : <Divider />}
        </Box>
      ))}
    </Stack>
  );
}

/**
 * Each completed run, newest first: every claim in the order it ran, who won
 * and why the rest lost, and priority after the run.
 */
export function CircuitWaiverResults(props: {
  runs: CircuitWaiverRun[];
  categoryNames: ReadonlyMap<number, string>;
}) {
  const { runs, categoryNames } = props;
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
        runs.map((run) => (
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
            <RunClaims run={run} categoryNames={categoryNames} />
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
