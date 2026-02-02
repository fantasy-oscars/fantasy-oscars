import { Link } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
  Title
} from "@mantine/core";
import type { AuthUser } from "../auth/context";
import type { HomeView } from "../orchestration/home";
import { Markdown } from "../ui/Markdown";

export function HomeScreen(props: {
  user: AuthUser | null;
  authLoading: boolean;
  view: HomeView;
}) {
  const { user, authLoading, view } = props;
  const landingBlurb = view.landingBlurb;
  const homeMain = view.homeMain;
  const seasons = view.seasons;

  return (
    <Box component="section" className="landing">
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <Card className="card landing-section">
              <Stack gap="sm">
                <Box component="header">
                  <Text className="eyebrow">Draft night, but for awards</Text>
                  <Title order={2} className="hero-title">
                    {landingBlurb.state === "ready" && landingBlurb.content.title
                      ? landingBlurb.content.title
                      : "Fantasy Oscars"}
                  </Title>
                  {landingBlurb.state === "ready" &&
                  landingBlurb.content.body_markdown ? (
                    <Markdown markdown={landingBlurb.content.body_markdown} />
                  ) : (
                    <Text className="lede">
                      Create a league, draft nominees, and watch standings update as
                      winners are announced.
                    </Text>
                  )}
                </Box>
                <Group className="inline-actions" justify="flex-start">
                  <Button component={Link} to="/about" variant="subtle">
                    Learn more
                  </Button>
                </Group>
              </Stack>
            </Card>

            <Card className="card landing-section" component="article">
              <Group
                className="header-with-controls"
                justify="space-between"
                align="start"
              >
                <Box>
                  <Title order={3}>
                    {homeMain.state === "ready" && homeMain.content?.title
                      ? homeMain.content.title
                      : "Updates"}
                  </Title>
                  {homeMain.state === "ready" && homeMain.content?.published_at ? (
                    <Text className="muted" c="dimmed" size="sm">
                      Published{" "}
                      {new Date(homeMain.content.published_at).toLocaleDateString(
                        undefined,
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric"
                        }
                      )}
                    </Text>
                  ) : null}
                </Box>
              </Group>
              {homeMain.state === "loading" ? (
                <Text className="muted" c="dimmed">
                  Loading...
                </Text>
              ) : homeMain.state === "error" ? (
                <Text className="muted" c="dimmed">
                  No updates yet.
                </Text>
              ) : homeMain.content ? (
                <Markdown markdown={homeMain.content.body_markdown} />
              ) : (
                <Text className="muted" c="dimmed">
                  It&apos;s quiet... too quiet.
                </Text>
              )}
            </Card>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Box component="aside" aria-label="Actions">
            <Stack gap="lg">
              <Card className="card">
                <Box component="header">
                  <Title order={3}>Create a league</Title>
                  <Text className="muted" c="dimmed">
                    Create a new league for the active ceremony. If you are signed out,
                    you will be prompted to log in first.
                  </Text>
                </Box>
                <Stack gap="sm" className="stack-sm">
                  <Button component={Link} to="/leagues/new">
                    New league
                  </Button>
                  {!authLoading && !user && (
                    <>
                      <Button component={Link} to="/register" variant="subtle">
                        Create account
                      </Button>
                      <Button component={Link} to="/login" variant="subtle">
                        Login
                      </Button>
                    </>
                  )}
                </Stack>
              </Card>

              {user && (
                <Card className="card" component="section" aria-label="Active seasons">
                  <Box component="header">
                    <Title order={3}>Active seasons</Title>
                  </Box>

                  {seasons.state === "loading" && (
                    <Group className="status status-loading" role="status" gap="xs">
                      <Loader size="sm" aria-hidden="true" />{" "}
                      <Text span>Loading seasons…</Text>
                    </Group>
                  )}

                  {seasons.state === "error" && (
                    <Alert className="status status-error" color="red" role="status">
                      {seasons.message}
                    </Alert>
                  )}

                  {seasons.state === "ready" && seasons.seasons.length === 0 && (
                    <Card className="card nested landing-season-card" mt="sm">
                      <Box component="header">
                        <Title order={4}>No active seasons yet</Title>
                        <Text className="muted" c="dimmed">
                          Create your first league to generate a season for the active
                          ceremony.
                        </Text>
                      </Box>
                      <Button component={Link} to="/leagues" variant="subtle">
                        Go to leagues
                      </Button>
                    </Card>
                  )}

                  {seasons.state === "ready" && seasons.seasons.length > 0 && (
                    <Stack gap="sm" mt="sm">
                      {seasons.seasons.map((s) => (
                        <Card key={s.id} className="card nested landing-season-card">
                          <Box component="header">
                            <Title order={4}>{s.league_name}</Title>
                            <Text className="muted" c="dimmed">
                              Ceremony {s.ceremony_id} • Season #{s.id} • {s.status}
                            </Text>
                          </Box>
                          <Group className="inline-actions" justify="flex-start">
                            <Button
                              component={Link}
                              to={`/seasons/${s.id}`}
                              variant="subtle"
                            >
                              Open season
                            </Button>
                          </Group>
                        </Card>
                      ))}
                      {seasons.total > 2 && (
                        <Button component={Link} to="/seasons" variant="subtle">
                          See all active seasons
                        </Button>
                      )}
                    </Stack>
                  )}
                </Card>
              )}
            </Stack>
          </Box>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
