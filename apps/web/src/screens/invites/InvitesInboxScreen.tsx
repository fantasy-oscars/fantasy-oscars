import type { InboxInvite } from "../../lib/types";
import { Alert, Box, Button, Divider, Group, Stack, Text, Title } from "@mantine/core";
import { PageLoader } from "../../ui/page-state";
import type { InvitesInboxView } from "../../orchestration/invites";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";

function inviteContext(invite: InboxInvite) {
  const left = invite.league_name ? invite.league_name : invite.league_id ? `League ${invite.league_id}` : "League";
  const right = invite.season_id ? `Season ${invite.season_id}` : "Season";
  return `${left} · ${right}`;
}

export function InvitesInboxScreen(props: {
  view: InvitesInboxView;
  onAccept: (invite: InboxInvite) => void | Promise<void>;
  onDecline: (invite: InboxInvite) => void | Promise<void>;
}) {
  const { view, onAccept, onDecline } = props;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack gap="md">
          <Box component="header">
            <Title order={2} className="baseline-textHeroTitle">
              Invites
            </Title>
            <Text className="baseline-textBody">
              Accept or decline season invites sent to you.
            </Text>
          </Box>

          <StandardCard component="section" aria-label="Pending invites">
            {view.state === "loading" ? (
              <PageLoader label="Loading invites..." />
            ) : view.state === "error" ? (
              <Alert color="red">{view.message}</Alert>
            ) : view.invites.length === 0 ? (
              <Text className="baseline-textBody">No pending invites.</Text>
            ) : (
              <Stack gap={0}>
                {view.invites.map((invite, idx) => (
                  <Box key={invite.id}>
                    {idx !== 0 ? <Divider /> : null}
                    <Group justify="space-between" align="flex-start" wrap="nowrap" py="sm">
                      <Stack gap={4} style={{ minWidth: 0 }}>
                        <Text className="baseline-textCardTitle" style={{ lineHeight: 1.2 }}>
                          {inviteContext(invite)}
                        </Text>
                      </Stack>
                      <Group gap="sm" wrap="nowrap">
                        <Button type="button" variant="filled" onClick={() => void onAccept(invite)}>
                          Accept
                        </Button>
                        <Button type="button" variant="outline" onClick={() => void onDecline(invite)}>
                          Decline
                        </Button>
                      </Group>
                    </Group>
                  </Box>
                ))}
              </Stack>
            )}
          </StandardCard>
        </Stack>
      </Box>
    </Box>
  );
}
