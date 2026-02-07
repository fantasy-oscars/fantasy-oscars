import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Title
} from "@mantine/core";
import type { LeagueSeasonCreateView } from "../../orchestration/seasons";
import { FormStatus } from "../../ui/forms";
import { PageError, PageLoader } from "../../ui/page-state";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";

export function LeagueSeasonCreateScreen(props: {
  leagueId: number;
  view: LeagueSeasonCreateView;
  actions: {
    setCeremonyId: (v: number | null) => void;
    setScoringStrategy: (v: "fixed" | "negative" | "category_weighted") => void;
    setRemainderStrategy: (v: "UNDRAFTED" | "FULL_POOL") => void;
    setTimerEnabled: (v: boolean) => void;
    setPickTimerSeconds: (v: number) => void;
    reset: () => void;
    submit: () => void;
  };
}) {
  const { leagueId, view, actions } = props;

  if (view.state === "loading") {
    return <PageLoader label="Loading..." />;
  }

  if (view.state === "forbidden") {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack gap="md" component="section">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                Create season
              </Title>
              <Text className="baseline-textBody">Access denied.</Text>
            </Box>
            <PageError message={view.message} />
          </Stack>
        </Box>
      </Box>
    );
  }

  if (view.state === "error") {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack gap="md" component="section">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                Create season
              </Title>
              <Text className="baseline-textBody">Unable to load</Text>
            </Box>
            <PageError message={view.message} />
          </Stack>
        </Box>
      </Box>
    );
  }

  const leagueName = view.league?.name ?? `League #${leagueId}`;

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack gap="md" component="section">
          <Group
            component="header"
            justify="space-between"
            align="flex-start"
            wrap="wrap"
          >
            <Box>
              <Title order={2} className="baseline-textHeroTitle">
                Create season
              </Title>
              <Text className="baseline-textBody">
                Create a new season for {leagueName}.
              </Text>
            </Box>
            <Button component={Link} to={`/leagues/${leagueId}`} variant="outline">
              Back to league
            </Button>
          </Group>

          <StandardCard>
            <Stack gap="sm">
              <Select
                label="Ceremony"
                placeholder="Select ceremony…"
                value={view.ceremonyId ? String(view.ceremonyId) : null}
                onChange={(v) => actions.setCeremonyId(v ? Number(v) : null)}
                disabled={view.working}
                data={view.ceremonies.map((c) => ({
                  value: String(c.id),
                  label: `${c.name} (${c.code})`
                }))}
              />
              {view.ceremonies.length === 0 && (
                <Text className="baseline-textMeta">
                  No published ceremonies available yet.
                </Text>
              )}

              <Select
                label="Scoring strategy"
                value={view.scoringStrategy}
                onChange={(v) =>
                  actions.setScoringStrategy(
                    (v ?? "fixed") as "fixed" | "negative" | "category_weighted"
                  )
                }
                disabled={view.working}
                data={[
                  { value: "fixed", label: "Standard" },
                  { value: "negative", label: "Negative" },
                  { value: "category_weighted", label: "Category-weighted" }
                ]}
              />

              <Select
                label="Leftover picks"
                value={view.remainderStrategy}
                onChange={(v) =>
                  actions.setRemainderStrategy(
                    (v ?? "UNDRAFTED") as "UNDRAFTED" | "FULL_POOL"
                  )
                }
                disabled={view.working}
                data={[
                  { value: "UNDRAFTED", label: "Leave extras undrafted" },
                  { value: "FULL_POOL", label: "Use full pool (extras drafted)" }
                ]}
              />

              <Group justify="space-between" align="end" wrap="wrap">
                <Switch
                  label="Pick timer"
                  checked={view.timerEnabled}
                  onChange={(e) => actions.setTimerEnabled(e.currentTarget.checked)}
                  disabled={view.working}
                />
                <NumberInput
                  label="Seconds per pick"
                  value={view.pickTimerSeconds}
                  onChange={(v) => actions.setPickTimerSeconds(Number(v) || 0)}
                  min={0}
                  step={5}
                  clampBehavior="strict"
                  disabled={view.working || !view.timerEnabled}
                />
              </Group>

              <Group wrap="wrap" justify="flex-start">
                <Button
                  type="button"
                  onClick={actions.submit}
                  disabled={!view.canSubmit}
                  variant="filled"
                >
                  {view.working ? "Creating..." : "Create season"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={actions.reset}
                  disabled={view.working}
                >
                  Reset
                </Button>
              </Group>

              <FormStatus loading={view.working} result={view.status} />
            </Stack>
          </StandardCard>
        </Stack>
      </Box>
    </Box>
  );
}
