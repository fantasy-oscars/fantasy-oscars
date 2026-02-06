import { Box, Stack, Text, Title } from "@mantine/core";
import { StandardCard } from "../../../primitives";
import "../../../primitives/baseline.css";

export function AdminSystemAuditLogPage() {
  return (
    <Stack component="section" className="stack">
      <Box component="header">
        <Title order={3} className="baseline-textSectionHeader">
          Audit Log
        </Title>
        <Text className="baseline-textBody" c="dimmed">
          Track admin actions (uploads, winner changes, locks).
        </Text>
      </Box>

      <StandardCard>
        <Text fw={700} className="baseline-textBody">
          Not wired yet.
        </Text>
        <Text className="baseline-textBody" c="dimmed" mt="xs">
          We will add an audit table once the API captures admin events.
        </Text>
      </StandardCard>
    </Stack>
  );
}
