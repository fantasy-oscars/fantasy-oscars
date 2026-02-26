import { Box, Button, Skeleton, Stack, Text, Title } from "@ui";
import { Link } from "react-router-dom";
import type { LeagueIndexView } from "@/orchestration/leagueIndex";
import { ActionCard, StandardCard } from "@/primitives";
import { leaguePath } from "@/lib/routes";
import "@/primitives/baseline.css";

export function LeagueIndexScreen(props: { view: LeagueIndexView }) {
  const { view } = props;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack gap="md">
          <Title order={2} className="baseline-textHeroTitle">
            Leagues
          </Title>

          <Box className="baseline-twoCol">
            <Box>
              {view.state === "loading" ? (
                <Box
                  className="baseline-leagueGrid"
                  role="status"
                  aria-label="Loading leagues"
                >
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <StandardCard key={idx} className="baseline-leagueTile">
                      <Stack gap="var(--fo-space-dense-2)">
                        <Skeleton height="var(--fo-font-size-sm)" width="72%" />
                        <Skeleton height="var(--fo-font-size-xs)" width="45%" />
                      </Stack>
                    </StandardCard>
                  ))}
                </Box>
              ) : view.state === "error" ? (
                <StandardCard>
                  <Text className="baseline-textBody">{view.message}</Text>
                </StandardCard>
              ) : view.leagues.length === 0 ? (
                <StandardCard>
                  <Text className="baseline-textBody">No leagues yet.</Text>
                </StandardCard>
              ) : (
                <Box className="baseline-leagueGrid">
                  {view.leagues.map((l) => (
                    <StandardCard
                      key={l.id}
                      interactive
                      className="baseline-leagueTile"
                      component={Link}
                      to={leaguePath({ leagueId: l.id, leagueName: l.name })}
                    >
                      <Stack gap="var(--fo-space-dense-2)">
                        <Text className="baseline-textCardTitle">{l.name}</Text>
                        <Text className="baseline-textMeta">
                          {l.commissioner_name ?? ""}
                        </Text>
                      </Stack>
                    </StandardCard>
                  ))}
                </Box>
              )}
            </Box>

            <Box className="baseline-stickyCol">
              <ActionCard>
                <Stack gap="sm">
                  <Text className="baseline-textCardTitle">Create a league</Text>
                  <Text className="baseline-textBody">
                    Start a season with friends and draft nominees together.
                  </Text>
                  <Button component={Link} to="/leagues/new" variant="primary">
                    New league
                  </Button>
                </Stack>
              </ActionCard>
            </Box>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
