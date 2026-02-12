import { Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import "../../../primitives/baseline.css";

export function AdminCeremoniesScoringScreen() {
  return (
    <Stack component="section">
      <Stack gap="var(--fo-space-0)">
        <Title order={3} className="baseline-textSectionHeader">
          Scoring
        </Title>
        <Text className="baseline-textBody" c="dimmed">
          Configure how picks are scored for this ceremony.
        </Text>
      </Stack>

      <StandardCard>
        <Text fw="var(--fo-font-weight-bold)" className="baseline-textBody">
          Not wired yet.
        </Text>
        <Text className="baseline-textBody" c="dimmed" mt="xs">
          We&apos;ll add scoring configuration once we settle on the scoring model.
        </Text>
      </StandardCard>
    </Stack>
  );
}
