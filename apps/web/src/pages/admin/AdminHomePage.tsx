import { Box, Card, Stack, Text, Title } from "@mantine/core";

export function AdminHomePage() {
  return (
    <Card className="card" component="section">
      <Box component="header">
        <Title order={2}>Admin</Title>
        <Text className="muted">Operational tools for running Fantasy Oscars.</Text>
      </Box>

      <Stack className="stack">
        <Card className="card nested" component="section">
          <Title order={3}>Purpose</Title>
          <Text className="muted">
            The Admin area exists to set up and maintain the game. Use it to configure
            ceremonies, upload nominee data, enter winners, and lock drafting at the right
            time.
          </Text>
          <Text className="muted">
            Admin changes can affect all users. If you are unsure, stop and verify in a
            non-prod environment first.
          </Text>
        </Card>

        <Card className="card nested" component="section">
          <Title order={3}>Responsibilities</Title>
          <Stack component="ul" className="list">
            <Box component="li" className="list-row">
              <Box>
                <Text fw={700}>Keep the active ceremony correct</Text>
                <Text className="muted">
                  Ensure drafts, nominees, and winner entry are pointed at the intended
                  ceremony.
                </Text>
              </Box>
            </Box>
            <Box component="li" className="list-row">
              <Box>
                <Text fw={700}>Manage nominees carefully</Text>
                <Text className="muted">
                  Upload nominee datasets before drafting starts; verify counts and
                  spot-check categories.
                </Text>
              </Box>
            </Box>
            <Box component="li" className="list-row">
              <Box>
                <Text fw={700}>Enter winners deliberately</Text>
                <Text className="muted">
                  The first winner locks drafting for the active ceremony; changes
                  afterward keep drafts locked.
                </Text>
              </Box>
            </Box>
            <Box component="li" className="list-row">
              <Box>
                <Text fw={700}>Communicate clearly</Text>
                <Text className="muted">
                  Post announcements or update static pages when rules, schedules, or
                  scoring details change. (Coming soon.)
                </Text>
              </Box>
            </Box>
          </Stack>
        </Card>

        <Card className="card nested" component="section">
          <Title order={3}>Operating Notes</Title>
          <Box className="status status-warning">
            Winner entry is effectively irreversible for gameplay: even if you change the
            winner, drafting remains locked.
          </Box>
          <Text className="muted" mt="sm">
            Audit logging and user administration will live here as the site matures.
          </Text>
        </Card>
      </Stack>
    </Card>
  );
}
