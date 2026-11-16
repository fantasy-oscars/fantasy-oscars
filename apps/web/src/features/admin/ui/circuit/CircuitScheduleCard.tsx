import { Box, Group, Stack, Text, Title } from "@ui";
import { EmptyState, StandardCard } from "@/primitives";
import {
  ceremonyLabel,
  dateOnlyLabel,
  occasionKindLabel
} from "@/decisions/admin/circuit";
import type { ScoringOccasion } from "@/orchestration/adminCircuit";

/** Scoring occasions in schedule order: dated first, then the ones still lacking a date. */
export function CircuitScheduleCard(props: { occasions: ScoringOccasion[] }) {
  return (
    <StandardCard component="section" aria-labelledby="circuit-schedule-title">
      <Title order={3} variant="section" id="circuit-schedule-title">
        Schedule
      </Title>
      <Text className="muted">
        Each ceremony scores twice: on its nominations date and on its results date.
      </Text>
      {props.occasions.length === 0 ? (
        <Box mt="md">
          <EmptyState>No ceremonies yet.</EmptyState>
        </Box>
      ) : (
        <Stack component="ol" gap="sm" mt="md" className="fo-listReset">
          {props.occasions.map((o) => (
            <Group
              key={`${o.ceremony_id}-${o.kind}`}
              component="li"
              justify="space-between"
              wrap="wrap"
              gap="xs"
              align="baseline"
            >
              <Text>
                {ceremonyLabel(o)} · {occasionKindLabel(o.kind)}
              </Text>
              <Text className={o.date ? undefined : "muted"}>
                {dateOnlyLabel(o.date)}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </StandardCard>
  );
}
