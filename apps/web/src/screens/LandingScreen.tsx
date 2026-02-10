import { Box, Button, Divider, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import { Link } from "react-router-dom";
import type { AuthUser } from "../auth/context";
import type { LandingSeasonPreview, LandingView } from "../orchestration/landing";
import { Markdown } from "../ui/Markdown";
import { ActionCard, HeroCard, LandingLayout, StandardCard } from "../primitives";
import { computeLandingSeasonStatus, markdownToTagline, titleCase } from "../decisions/landing";
import "../primitives/baseline.css";

function ceremonyMeta(season: LandingSeasonPreview): string {
  return season.ceremony_name ?? `Ceremony ${season.ceremony_id}`;
}

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
        <Stack gap={22}>
          <Title className="baseline-textHeroTitle" order={1}>
            {heroTitle}
          </Title>
          <Text className="baseline-textBody baseline-heroTagline">{tagline}</Text>
        </Stack>
      </HeroCard>

      <Divider />

      <StandardCard className="baseline-updatesCard">
        {view.updates.state === "loading" ? (
          <Text className="baseline-textBody">Loading…</Text>
        ) : view.updates.state === "error" ? (
          <Text className="baseline-textBody">{view.updates.message}</Text>
        ) : view.updates.content ? (
          <Stack gap={10}>
            <Text className="baseline-textMeta">
              {updatesDate ? updatesDate.toLocaleDateString() : ""}
            </Text>
            <Text className="baseline-textCardTitle">{view.updates.content.title}</Text>
            <Markdown markdown={view.updates.content.body_markdown} />
          </Stack>
        ) : (
          <Stack gap={10}>
            <Text className="baseline-textMeta">{new Date().toLocaleDateString()}</Text>
            <Text className="baseline-textCardTitle">It’s quiet… too quiet</Text>
            <Text className="baseline-textBody">No updates have been published yet.</Text>
          </Stack>
        )}
      </StandardCard>
    </Stack>
  );

  const right = (
    <Stack gap="md">
      <ActionCard>
        <Stack gap="sm">
          <Text className="baseline-textCardTitle">Create a league</Text>
          <Text className="baseline-textBody">
            Start a season with friends and draft nominees together.
          </Text>
          <Button
            component={Link}
            to={user ? "/leagues/new" : "/login"}
            disabled={authLoading}
            variant="filled"
            color="blue"
          >
            New league
          </Button>
        </Stack>
      </ActionCard>

      <Divider />

      <Box>
        <Text className="baseline-textSectionHeader">Active Seasons</Text>
      </Box>

      {user ? (
        view.seasons.state === "idle" ? null : view.seasons.state === "loading" ? (
          <StandardCard>
            <Text className="baseline-textBody">Loading…</Text>
          </StandardCard>
        ) : view.seasons.state === "error" ? (
          <StandardCard>
            <Text className="baseline-textBody">{view.seasons.message}</Text>
          </StandardCard>
        ) : view.seasons.seasons.length === 0 ? (
          <StandardCard>
            <Text className="baseline-textBody">No active seasons yet.</Text>
          </StandardCard>
        ) : (
          <Stack gap="sm">
            {view.seasons.seasons.map((s) => {
              const status = computeLandingSeasonStatus({
                draftStatus: s.draft_status,
                draftId: s.draft_id
              });
              return (
                <StandardCard
                  key={s.id}
                  interactive
                  component={Link}
                  to={`/seasons/${s.id}`}
                >
                  <Stack gap={10}>
                    <Text className="baseline-textCardTitle">{s.league_name}</Text>
                    <Group className="baseline-metaRow" gap="sm" wrap="nowrap">
                      <Text className="baseline-textMeta">{ceremonyMeta(s)}</Text>
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
                            "baseline-textMeta",
                            status.urgent ? "isUrgent" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
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
          <Text className="baseline-textBody">Log in to view your active seasons.</Text>
        </StandardCard>
      )}
    </Stack>
  );

  return <LandingLayout left={left} right={right} />;
}
