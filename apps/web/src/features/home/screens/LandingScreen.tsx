import { Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import { Link } from "react-router-dom";
import type { AuthUser } from "@/auth/context";
import type { LandingView } from "@/orchestration/landing";
import { Markdown } from "@ui/Markdown";
import {
  ActionCard,
  EmptyState,
  HeroCard,
  LandingLayout,
  StandardCard
} from "@/primitives";
import {
  HERO_FALLBACK_TAGLINE,
  computeHeroTitleTier,
  computeLandingSeasonCeremonyLabel,
  computeLandingSeasonStatus,
  formatUpdateDate,
  markdownToTagline,
  titleCase
} from "@/decisions/landing";
import { seasonPath } from "@/lib/routes";
import { statusTone } from "@/decisions/statusTone";
import { PageError } from "@/shared/page-state";
import { StatusPill } from "@/shared/pills";
import "@/primitives/baseline.css";

const HERO_FALLBACK_TITLE = "Fantasy Oscars";

function SeasonsSkeleton() {
  return (
    <Stack gap="sm" role="status" aria-label="Loading seasons">
      {Array.from({ length: 2 }).map((_, idx) => (
        <StandardCard key={idx}>
          <Stack gap="var(--fo-space-dense-2)">
            <Skeleton height="var(--fo-font-size-sm)" width="65%" />
            <Group className="baseline-metaRow" gap="sm" wrap="nowrap">
              <Skeleton height="var(--fo-font-size-xs)" width="45%" />
              <Skeleton height="var(--fo-font-size-xs)" width="28%" />
            </Group>
          </Stack>
        </StandardCard>
      ))}
    </Stack>
  );
}

export function LandingScreen(props: {
  user: AuthUser | null;
  authLoading: boolean;
  view: LandingView;
  refresh: { updates: () => Promise<void>; seasons: () => Promise<void> };
}) {
  const { user, authLoading, view, refresh } = props;

  const heroTitle =
    view.blurb.state === "ready" ? view.blurb.content.title : HERO_FALLBACK_TITLE;
  const tagline =
    view.blurb.state === "ready"
      ? markdownToTagline(view.blurb.content.body_markdown)
      : view.blurb.state === "error"
        ? HERO_FALLBACK_TAGLINE
        : "";

  const hero = (
    <HeroCard>
      <Title variant="hero" data-tier={computeHeroTitleTier(heroTitle)}>
        {heroTitle}
      </Title>
      {view.blurb.state === "loading" ? (
        <Skeleton
          className="baseline-heroTagline"
          height="calc(var(--fo-font-size-md) * 1.4)"
          width="60%"
          role="status"
          aria-label="Loading"
        />
      ) : tagline ? (
        <Text variant="helper" className="baseline-heroTagline">
          {tagline}
        </Text>
      ) : null}
    </HeroCard>
  );

  const updates = (
    <StandardCard className="baseline-updatesCard">
      {view.updates.state === "loading" ? (
        <Stack gap="var(--fo-space-dense-2)" role="status" aria-label="Loading updates">
          <Skeleton height="var(--fo-font-size-xs)" width="25%" />
          <Skeleton height="var(--fo-heading-h2-size)" width="70%" />
          <Stack gap="var(--fo-space-dense-1)">
            <Skeleton height="var(--fo-font-size-sm)" width="90%" />
            <Skeleton height="var(--fo-font-size-sm)" width="78%" />
            <Skeleton height="var(--fo-font-size-sm)" width="84%" />
          </Stack>
        </Stack>
      ) : view.updates.state === "error" ? (
        <Stack gap="sm" align="flex-start">
          <PageError message={view.updates.message} />
          <Button variant="secondary" onClick={() => void refresh.updates()}>
            Try again
          </Button>
        </Stack>
      ) : view.updates.content ? (
        <Stack gap="var(--fo-space-xs)">
          <Stack gap="var(--fo-space-dense-2)">
            <Text
              variant="meta"
              component="time"
              dateTime={view.updates.content.published_at ?? undefined}
            >
              {formatUpdateDate(view.updates.content.published_at)}
            </Text>
            <Title variant="page" order={3} className="baseline-wrapAnywhere">
              {view.updates.content.title}
            </Title>
          </Stack>
          <div className="baseline-wrapAnywhere">
            <Markdown markdown={view.updates.content.body_markdown} headingBase={4} />
          </div>
        </Stack>
      ) : (
        <Stack gap="var(--fo-space-dense-2)">
          <Title variant="page" order={3}>
            It’s quiet… too quiet
          </Title>
          <EmptyState>No updates have been published yet.</EmptyState>
        </Stack>
      )}
    </StandardCard>
  );

  const showSeeAll =
    Boolean(user) && view.seasons.state === "ready" && view.seasons.seasons.length > 0;

  const aside = (
    <>
      <ActionCard>
        <Stack gap="sm">
          <Title variant="section" order={3}>
            Create a league
          </Title>
          <Text>Start a season with friends and draft nominees together.</Text>
          <Button
            component={Link}
            to={user ? "/leagues/new" : "/login"}
            state={user ? undefined : { from: "/leagues/new" }}
            disabled={authLoading}
            variant="primary"
            fullWidth
          >
            New league
          </Button>
        </Stack>
      </ActionCard>

      <Stack gap="md">
        <Group
          className="baseline-seasonsHeading"
          justify="space-between"
          align="center"
          wrap="wrap"
        >
          <Title variant="section">Active seasons</Title>
          {showSeeAll ? (
            <Button
              variant="ghost"
              component={Link}
              to="/seasons"
              aria-label="See all seasons"
            >
              See all
            </Button>
          ) : null}
        </Group>

        {authLoading ? (
          <SeasonsSkeleton />
        ) : !user ? (
          <StandardCard>
            <Stack gap="sm" align="flex-start">
              <Text>Log in to see your active seasons.</Text>
              <Button variant="secondary" component={Link} to="/login">
                Log in
              </Button>
            </Stack>
          </StandardCard>
        ) : view.seasons.state === "idle" || view.seasons.state === "loading" ? (
          <SeasonsSkeleton />
        ) : view.seasons.state === "error" ? (
          <Stack gap="sm" align="flex-start">
            <PageError message={view.seasons.message} />
            <Button variant="secondary" onClick={() => void refresh.seasons()}>
              Try again
            </Button>
          </Stack>
        ) : view.seasons.seasons.length === 0 ? (
          <EmptyState>
            No active seasons yet. Start one with New league, or accept an invite from a
            commissioner.
          </EmptyState>
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
                  to={seasonPath({
                    leagueId: s.league_id,
                    leagueName: s.league_name,
                    ceremonyCode: s.ceremony_code,
                    ceremonyId: s.ceremony_id
                  })}
                >
                  <Stack gap="var(--fo-space-dense-2)">
                    <Title variant="card" className="baseline-wrapAnywhere">
                      {ceremonyLabel}
                    </Title>
                    <Group className="baseline-metaRow" gap="sm" wrap="nowrap">
                      <Text variant="meta" className="baseline-wrapAnywhere">
                        {s.league_name}
                      </Text>
                      <StatusPill {...statusTone(status.label)}>
                        {titleCase(status.label)}
                      </StatusPill>
                    </Group>
                  </Stack>
                </StandardCard>
              );
            })}
          </Stack>
        )}
      </Stack>
    </>
  );

  return <LandingLayout hero={hero} updates={updates} aside={aside} />;
}
