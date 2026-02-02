import type { ApiResult } from "../../lib/types";
import { Box, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { FormStatus } from "../../ui/forms";

export function InviteClaimScreen(props: {
  token?: string;
  loading: boolean;
  result: ApiResult | null;
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
}) {
  const { token, loading, result, onAccept, onDecline } = props;

  return (
    <Card className="card" component="section">
      <Group className="header-with-controls" justify="space-between" align="start">
        <Box>
          <Title order={2}>Invite</Title>
          <Text>Claim a league invite.</Text>
        </Box>
      </Group>
      <Stack className="stack" gap="sm">
        <Text className="muted" c="dimmed">
          You have been invited to join a league. Accept to join the season roster.
        </Text>
        <Group className="inline-actions" justify="flex-start">
          <Button type="button" onClick={onAccept} disabled={loading}>
            {loading ? "Working..." : "Accept invite"}
          </Button>
          <Button type="button" variant="subtle" onClick={onDecline} disabled={loading}>
            Decline
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          Invite: {token}
        </Text>
        <FormStatus loading={loading} result={result} />
      </Stack>
    </Card>
  );
}
