import { Box, Card, Stack, Text, Title } from "@mantine/core";

export function AdminSystemAuditLogPage() {
  return (
    <Stack component="section" className="stack">
      <Box component="header">
        <Title order={3}>Audit Log</Title>
        <Text className="muted">
          Track admin actions (uploads, winner changes, locks).
        </Text>
      </Box>

      <Card className="empty-state">
        <Text fw={700}>Not wired yet.</Text>
        <Text className="muted" mt="xs">
          We will add an audit table once the API captures admin events.
        </Text>
      </Card>
    </Stack>
  );
}
