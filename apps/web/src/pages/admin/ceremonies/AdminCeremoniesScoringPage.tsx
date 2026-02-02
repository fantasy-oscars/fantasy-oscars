import { Card, Stack, Text, Title } from "@mantine/core";

export function AdminCeremoniesScoringPage() {
  return (
    <Stack component="section" className="stack">
      <Stack gap={0}>
        <Title order={3}>Scoring</Title>
        <Text className="muted">Configure how picks are scored for this ceremony.</Text>
      </Stack>

      <Card className="empty-state">
        <Text fw={700}>Not wired yet.</Text>
        <Text className="muted" mt="xs">
          We&apos;ll add scoring configuration once we settle on the scoring model.
        </Text>
      </Card>
    </Stack>
  );
}
