import { Box, Button, Divider, Group, Stack, Text, Title, Tooltip } from "@ui";
import { Link } from "react-router-dom";
import type { AuthUser } from "@/auth/context";
import type { LandingView } from "@/orchestration/landing";
import { Markdown } from "@ui/Markdown";
import { ActionCard, HeroCard, LandingLayout, StandardCard } from "@/primitives";
import {
  computeLandingSeasonCeremonyLabel,
  computeLandingSeasonStatus,
  markdownToTagline,
  titleCase
} from "@/decisions/landing";
import "@/primitives/baseline.css";

export function LandingScreen(props: {
  user: AuthUser | null;
  authLoading: boolean;
  view: LandingView;
}) {
  const { user, authLoading, view } = props;

  const heroTitle =
    view.blurb.state === "ready" ? view.blurb.content.title : "Fantasy Oscars";
  const tagline =
    view.blurb.state === "ready"
      ? markdownToTagline(view.blurb.content.body_markdown)
      : "";

  const updatesDate =
    view.updates.state === "ready" && view.updates.content?.published_at
      ? new Date(view.updates.content.published_at)
      : null;

  const left = (
    <Stack gap="md">
      <HeroCard>
        <Stack gap="var(--fo-space-md)">
          <Title variant="hero">{heroTitle}</Title>
          <Text variant="helper">{tagline}</Text>
        </Stack>
      </HeroCard>

      <Divider />

      <StandardCard className="baseline-updatesCard">
        {view.updates.state === "loading" ? (
          <Text>Loading…</Text>
        ) : view.updates.state === "error" ? (
          <Text>{view.updates.message}</Text>
        ) : view.updates.content ? (
          <Stack gap="var(--fo-space-dense-2)">
            <Text variant="meta">
              {updatesDate ? updatesDate.toLocaleDateString() : ""}
            </Text>
            <Title variant="card">{view.updates.content.title}</Title>
            <Markdown markdown={view.updates.content.body_markdown} />
          </Stack>
        ) : (
          <Stack gap="var(--fo-space-dense-2)">
            <Text variant="meta">{new Date().toLocaleDateString()}</Text>
            <Title variant="card">It’s quiet… too quiet</Title>
            <Text>No updates have been published yet.</Text>
          </Stack>
        )}
      </StandardCard>
    </Stack>
  );

  const right = (
    <Stack gap="md">
      <ActionCard>
        <Stack gap="sm">
          <Title variant="card">Create a league</Title>
          <Text>Start a season with friends and draft nominees together.</Text>
          <Button
            component={Link}
            to={user ? "/leagues/new" : "/login"}
            disabled={authLoading}
            variant="primary"
          >
            New league
          </Button>
        </Stack>
      </ActionCard>

      <Divider />

      <Box>
        <Title variant="section">Active Seasons</Title>
      </Box>

      {user ? (
        view.seasons.state === "idle" ? null : view.seasons.state === "loading" ? (
          <StandardCard>
            <Text>Loading…</Text>
          </StandardCard>
        ) : view.seasons.state === "error" ? (
          <StandardCard>
            <Text>{view.seasons.message}</Text>
          </StandardCard>
        ) : view.seasons.seasons.length === 0 ? (
          <StandardCard>
            <Text>No active seasons yet.</Text>
          </StandardCard>
        ) : (
          <Stack gap="sm">
            {view.seasons.seasons.map((s) => {
              const status = computeLandingSeasonStatus({
                draftStatus: s.draft_status,
                draftId: s.draft_id
              });
              const ceremonyLabel = computeLandingSeasonCeremonyLabel({
                ceremonyName: s.ceremony_name,
                ceremonyId: s.ceremony_id
              });
              return (
                <StandardCard
                  key={s.id}
                  interactive
                  component={Link}
                  to={`/seasons/${s.id}`}
                >
                  <Stack gap="var(--fo-space-dense-2)">
                    <Title variant="card">{ceremonyLabel}</Title>
                    <Group className="baseline-metaRow" gap="sm" wrap="nowrap">
                      <Text variant="meta">{s.league_name}</Text>
                      <Tooltip
                        label={status.urgencyHelp ?? ""}
                        disabled={!status.urgencyHelp}
                        withArrow
                      >
                        <Text
                          component="span"
                          tabIndex={status.urgencyHelp ? 0 : -1}
                          className={[
                            "baseline-statusPill",
                            status.urgent ? "isUrgent" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          variant="meta"
                        >
                          {titleCase(status.label)}
                        </Text>
                      </Tooltip>
                    </Group>
                  </Stack>
                </StandardCard>
              );
            })}
          </Stack>
        )
      ) : (
        <StandardCard>
          <Text>Log in to view your active seasons.</Text>
        </StandardCard>
      )}
    </Stack>
  );

  return <LandingLayout left={left} right={right} />;
}
