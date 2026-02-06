import { Stack, Text, Title } from "@mantine/core";
import { StandardCard } from "../../../primitives";
import "../../../primitives/baseline.css";

export function AdminCeremoniesScoringPage() {
  return (
    <Stack component="section">
      <Stack gap={0}>
        <Title order={3} className="baseline-textSectionHeader">
          Scoring
        </Title>
        <Text className="baseline-textBody" c="dimmed">
          Configure how picks are scored for this ceremony.
        </Text>
      </Stack>

      <StandardCard>
        <Text fw={700} className="baseline-textBody">
          Not wired yet.
        </Text>
        <Text className="baseline-textBody" c="dimmed" mt="xs">
          We&apos;ll add scoring configuration once we settle on the scoring model.
        </Text>
      </StandardCard>
    </Stack>
  );
}
