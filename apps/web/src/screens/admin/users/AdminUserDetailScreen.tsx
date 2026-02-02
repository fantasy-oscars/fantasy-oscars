import { Link } from "react-router-dom";
import { Box, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import type { ApiResult } from "../../../lib/types";

export function AdminUserDetailScreen(props: {
  user: { id: number; username: string; email: string; is_admin: boolean };
  status: ApiResult | null;
  onPromote: () => void;
  onDemote: () => void;
}) {
  const { user, status, onPromote, onDemote } = props;

  return (
    <Stack component="section" className="stack">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={3}>{user.username}</Title>
          <Text className="muted">{user.email}</Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          {user.is_admin ? (
            <Box component="span" className="pill">
              Admin
            </Box>
          ) : (
            <Box component="span" className="pill muted">
              User
            </Box>
          )}
          <Button component={Link} variant="subtle" to="/admin/users">
            Back to search
          </Button>
        </Group>
      </Group>

      <Card className="card nested">
        <Title order={4}>Role</Title>
        <Text className="muted">
          Use this to grant or remove admin access. Admins can change global ceremony
          state and winners.
        </Text>
        <Group className="inline-actions" mt="sm" wrap="wrap">
          {user.is_admin ? (
            <Button type="button" className="danger" onClick={onDemote}>
              Demote from admin
            </Button>
          ) : (
            <Button type="button" onClick={onPromote}>
              Promote to admin
            </Button>
          )}
        </Group>
        <FormStatus loading={false} result={status} />
      </Card>
    </Stack>
  );
}
