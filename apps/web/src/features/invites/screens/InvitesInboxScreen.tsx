import type { InboxInvite } from "@/lib/types";
import { Alert, Box, Button, Divider, Group, Stack, Text, Title } from "@ui";
import { PageLoader } from "@/shared/page-state";
import type { InvitesInboxView } from "@/orchestration/invites";
import { inviteContextLine } from "@/decisions/invites";
import { StandardCard } from "@/primitives";
import "@/primitives/baseline.css";

export function InvitesInboxScreen(props: {
  view: InvitesInboxView;
  onAccept: (invite: InboxInvite) => void | Promise<void>;
  onDecline: (invite: InboxInvite) => void | Promise<void>;
}) {
  const { view, onAccept, onDecline } = props;

  if (view.state === "loading") {
    // Prevent "heading appears before actions are ready" UX (and avoids brittle tests).
    return <PageLoader label="Loading invites..." />;
  }

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
            {view.state === "error" ? (
              <Alert color="red">{view.message}</Alert>
            ) : view.invites.length === 0 ? (
              <Text className="baseline-textBody">No pending invites.</Text>
            ) : (
              <Stack gap="var(--fo-space-0)">
                {view.invites.map((invite, idx) => (
                  <Box key={invite.id}>
                    {idx !== 0 ? <Divider /> : null}
                    <Group justify="space-between" align="flex-start" wrap="wrap" py="sm">
                      <Stack gap="var(--fo-space-4)" miw="var(--fo-space-0)">
                        <Text
                          className="baseline-textCardTitle"
                          lh="var(--fo-line-height-tight)"
                        >
                          {inviteContextLine({
                            leagueName: invite.league_name,
                            leagueId: invite.league_id,
                            seasonId: invite.season_id
                          })}
                        </Text>
                      </Stack>
                      <Group gap="sm" wrap="wrap">
                        <Button
                          type="button"
                          variant="filled"
                          onClick={() => void onAccept(invite)}
                        >
                          Accept
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void onDecline(invite)}
                        >
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
