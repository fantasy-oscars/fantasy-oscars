import { Group, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
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
        <Text className="muted" size="sm" mt="sm">
          No ceremonies yet.
        </Text>
      ) : (
        <Stack component="ol" gap="xs" mt="sm" className="fo-listReset">
          {props.occasions.map((o) => (
            <Group
              key={`${o.ceremony_id}-${o.kind}`}
              component="li"
              justify="space-between"
              wrap="wrap"
              gap="xs"
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
