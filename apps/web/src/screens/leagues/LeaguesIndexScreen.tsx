import { Link } from "react-router-dom";
import { Box, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import type { LeaguesIndexView } from "../../orchestration/leagues";
import { PageLoader } from "../../ui/page-state";

export function LeaguesIndexScreen(props: { view: LeaguesIndexView }) {
  const { view } = props;

  return (
    <Card className="card" component="section">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={2}>Leagues</Title>
          <Text className="muted">Browse or manage your leagues.</Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          <Button component={Link} to="/leagues/new">
            Create league
          </Button>
        </Group>
      </Group>

      {view.state === "loading" && <PageLoader label="Loading leagues..." />}
      {view.state === "error" && (
        <Box className="status status-error">{view.message}</Box>
      )}
      {view.state === "empty" && (
        <Card className="empty-state">
          <Text className="muted">You are not in any leagues yet.</Text>
        </Card>
      )}
      {view.state === "ready" && (
        <Box className="grid">
          {view.leagues.map((league) => (
            <Card key={league.id} className="card nested">
              <Box component="header">
                <Title order={3}>{league.name}</Title>
                <Text className="muted">Code: {league.code}</Text>
              </Box>
              <Stack className="inline-actions" mt="sm">
                <Button component={Link} to={`/leagues/${league.id}`} variant="subtle">
                  Open league
                </Button>
              </Stack>
            </Card>
          ))}
        </Box>
      )}
    </Card>
  );
}
