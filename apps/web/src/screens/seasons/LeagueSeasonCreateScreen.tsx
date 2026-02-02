import { Link } from "react-router-dom";
import { Box, Button, Card, Group, Select, Stack, Text, Title } from "@mantine/core";
import type { LeagueSeasonCreateView } from "../../orchestration/seasons";
import { FormStatus } from "../../ui/forms";
import { PageError, PageLoader } from "../../ui/page-state";

export function LeagueSeasonCreateScreen(props: {
  leagueId: number;
  view: LeagueSeasonCreateView;
  actions: {
    setCeremonyId: (v: number | null) => void;
    setScoringStrategy: (v: "fixed" | "negative") => void;
    setRemainderStrategy: (v: "UNDRAFTED" | "FULL_POOL") => void;
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
      <Card className="card" component="section">
        <Box component="header">
          <Title order={2}>Create season</Title>
          <Text className="muted">Access denied.</Text>
        </Box>
        <PageError message={view.message} />
      </Card>
    );
  }

  if (view.state === "error") {
    return (
      <Card className="card" component="section">
        <Box component="header">
          <Title order={2}>Create season</Title>
          <Text className="muted">Unable to load</Text>
        </Box>
        <PageError message={view.message} />
      </Card>
    );
  }

  const leagueName = view.league?.name ?? `League #${leagueId}`;

  return (
    <Card className="card" component="section">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={2}>Create season</Title>
          <Text className="muted">Create a new season for {leagueName}.</Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          <Button component={Link} to={`/leagues/${leagueId}`} variant="subtle">
            Back to league
          </Button>
        </Group>
      </Group>

      <Stack className="stack-sm" gap="sm" mt="md">
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
          <Text className="muted" size="sm">
            No published ceremonies available yet.
          </Text>
        )}

        <Select
          label="Scoring strategy"
          value={view.scoringStrategy}
          onChange={(v) =>
            actions.setScoringStrategy((v ?? "fixed") as "fixed" | "negative")
          }
          disabled={view.working}
          data={[
            { value: "fixed", label: "Fixed" },
            { value: "negative", label: "Negative" }
          ]}
        />

        <Select
          label="Leftover picks"
          value={view.remainderStrategy}
          onChange={(v) =>
            actions.setRemainderStrategy((v ?? "UNDRAFTED") as "UNDRAFTED" | "FULL_POOL")
          }
          disabled={view.working}
          data={[
            { value: "UNDRAFTED", label: "Leave extras undrafted" },
            { value: "FULL_POOL", label: "Use full pool (extras drafted)" }
          ]}
        />

        <Group className="inline-actions" wrap="wrap">
          <Button type="button" onClick={actions.submit} disabled={!view.canSubmit}>
            {view.working ? "Creating..." : "Create season"}
          </Button>
          <Button
            type="button"
            variant="subtle"
            onClick={actions.reset}
            disabled={view.working}
          >
            Reset
          </Button>
        </Group>

        <FormStatus loading={view.working} result={view.status} />
      </Stack>
    </Card>
  );
}
