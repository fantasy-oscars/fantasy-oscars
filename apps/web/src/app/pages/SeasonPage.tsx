import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Stack, Title } from "@ui";
import { useAuthContext } from "@/auth/context";
import { useSeasonOrchestration } from "@/orchestration/seasons";
import { useSeasonRouteOrchestration } from "@/orchestration/seasons/seasonRouteOrchestration";
import { SeasonScreen } from "@/features/seasons/screens/SeasonScreen";
import { leaguePath, parsePositiveIntParam, seasonPath } from "@/lib/routes";
import { PageError, PageLoader } from "@/shared/page-state";
import "@/primitives/baseline.css";

function ResolvedSeasonPage(props: {
  seasonId: number;
  seasonIdLabel: string;
  preferCanonicalUrl: boolean;
  leagueIdHint?: number | null;
}) {
  const { seasonId, seasonIdLabel, preferCanonicalUrl, leagueIdHint } = props;
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const s = useSeasonOrchestration(seasonId, user?.sub, {
    leagueIdHint: leagueIdHint ?? null
  });

  useEffect(() => {
    if (!preferCanonicalUrl) return;
    const league = s.leagueContext?.league;
    const season = s.leagueContext?.season;
    if (!league?.id || !season?.ceremony_code) return;
    navigate(
      seasonPath({
        leagueId: league.id,
        leagueName: league.name,
        ceremonyCode: season.ceremony_code,
        ceremonyId: season.ceremony_id
      }),
      { replace: true }
    );
  }, [navigate, preferCanonicalUrl, s.leagueContext?.league, s.leagueContext?.season]);

  function navigateAfterLeave() {
    if (s.leagueContext?.league?.id) {
      navigate(
        leaguePath({
          leagueId: s.leagueContext.league.id,
          leagueName: s.leagueContext.league.name
        }),
        { replace: true }
      );
    } else {
      navigate("/seasons", { replace: true });
    }
  }

  return (
    <SeasonScreen
      seasonIdLabel={seasonIdLabel}
      leagueIdForBackLink={s.leagueContext?.league?.id ?? null}
      view={s}
      onLeaveSeason={navigateAfterLeave}
      onDeleteSeason={async () => {
        await s.cancelSeason();
        navigateAfterLeave();
      }}
    />
  );
}

export function SeasonPage() {
  const { id, leagueId: leagueIdRaw, ceremonyCode } = useParams();

  const seasonIdFromLegacy = parsePositiveIntParam(id);
  const leagueId = parsePositiveIntParam(leagueIdRaw);
  const { resolvedSeasonId, resolving, resolveError, resolveRequestId } =
    useSeasonRouteOrchestration({
      seasonIdFromLegacy,
      leagueId,
      ceremonyCode
    });

  if (resolving && !resolvedSeasonId) {
    return <PageLoader label="Loading season..." />;
  }

  if (!resolvedSeasonId) {
    return (
      <Box className="baseline-page">
        <Box className="baseline-pageInner">
          <Stack component="section" gap="md">
            <Box component="header">
              <Title order={2} className="baseline-textHeroTitle">
                Season
              </Title>
            </Box>
            <PageError
              message={resolveError ?? "Could not resolve season route."}
              requestId={resolveRequestId}
            />
          </Stack>
        </Box>
      </Box>
    );
  }

  return (
    <ResolvedSeasonPage
      seasonId={resolvedSeasonId}
      seasonIdLabel={String(resolvedSeasonId)}
      preferCanonicalUrl={Boolean(seasonIdFromLegacy)}
      leagueIdHint={leagueId}
    />
  );
}
