import type { InboxInvite } from "../../lib/types";
import { Alert, Box, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { PageLoader } from "../../ui/page-state";
import type { InvitesInboxView } from "../../orchestration/invites";

export function InvitesInboxScreen(props: {
  view: InvitesInboxView;
  onAccept: (invite: InboxInvite) => void | Promise<void>;
  onDecline: (invite: InboxInvite) => void | Promise<void>;
}) {
  const { view, onAccept, onDecline } = props;

  if (view.state === "loading") return <PageLoader label="Loading invites..." />;

  return (
    <Card className="card" component="section">
      <Group className="header-with-controls" justify="space-between" align="start">
        <Box>
          <Title order={2}>Invites</Title>
          <Text className="muted" c="dimmed">
            Accept or decline season invites sent to you.
          </Text>
        </Box>
      </Group>
      {view.state === "error" && <Alert color="red">{view.message}</Alert>}
      {view.state === "ready" && view.invites.length === 0 ? (
        <Text className="muted" c="dimmed">
          No pending invites.
        </Text>
      ) : null}
      {view.state === "ready" && view.invites.length > 0 ? (
        <Stack className="list" gap="sm">
          {view.invites.map((invite) => (
            <Group
              key={invite.id}
              className="list-row"
              justify="space-between"
              align="start"
            >
              <Stack gap={6}>
                <Group className="pill-list" gap={6} wrap="wrap">
                  <Text component="span" className="pill">
                    #{invite.id}
                  </Text>
                  {invite.league_name && (
                    <Text component="span" className="pill">
                      {invite.league_name}
                    </Text>
                  )}
                  {invite.ceremony_id && (
                    <Text component="span" className="pill">
                      Ceremony {invite.ceremony_id}
                    </Text>
                  )}
                </Group>
                <Text className="muted" c="dimmed">
                  Season {invite.season_id} • {invite.kind}
                </Text>
              </Stack>
              <Group className="pill-actions" gap="sm">
                <Button type="button" onClick={() => void onAccept(invite)}>
                  Accept
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  onClick={() => void onDecline(invite)}
                >
                  Decline
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      ) : null}
    </Card>
  );
}
