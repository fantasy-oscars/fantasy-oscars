import { Link } from "react-router-dom";
import { Alert, Box, Card, Group, Stack, Text, Title } from "@mantine/core";
import type { SeasonsIndexView } from "../../orchestration/seasons";
import { PageLoader } from "../../ui/page-state";

export function SeasonsIndexScreen(props: { view: SeasonsIndexView }) {
  const { view } = props;

  return (
    <Card className="card" component="section">
      <Group className="header-with-controls" justify="space-between" align="start">
        <Box>
          <Title order={2}>Seasons</Title>
          <Text className="muted" c="dimmed">
            Seasons are created per league per ceremony.
          </Text>
        </Box>
      </Group>

      {view.state === "loading" && <PageLoader label="Loading seasons..." />}
      {view.state === "error" && <Alert color="red">{view.message}</Alert>}
      {view.state === "ready" && view.rows.length === 0 && (
        <Text className="muted" c="dimmed">
          No seasons yet.
        </Text>
      )}
      {view.state === "ready" && view.rows.length > 0 && (
        <Stack className="stack-lg" gap="lg">
          {view.rows.map(({ league, seasons }) => (
            <Card key={league.id} className="card nested">
              <Box component="header">
                <Title order={3}>{league.name}</Title>
                <Text className="muted" c="dimmed">
                  League code: {league.code}
                </Text>
              </Box>
              {seasons.length === 0 ? (
                <Text className="muted" c="dimmed">
                  No seasons found for this league.
                </Text>
              ) : (
                <Stack className="list" gap="sm">
                  {seasons.map((s) => (
                    <Group
                      key={s.id}
                      className="list-row"
                      justify="space-between"
                      align="start"
                    >
                      <Stack gap={6}>
                        <Text fw={600}>Season #{s.id}</Text>
                        <Text className="muted" c="dimmed">
                          Ceremony {s.ceremony_id} • {s.status}
                        </Text>
                      </Stack>
                      <Group className="pill-actions" gap="sm">
                        <Text component={Link} to={`/seasons/${s.id}`}>
                          Open
                        </Text>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              )}
            </Card>
          ))}
        </Stack>
      )}
    </Card>
  );
}
