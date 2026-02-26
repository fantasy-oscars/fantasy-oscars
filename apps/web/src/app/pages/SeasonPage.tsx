import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Stack, Text, Title } from "@ui";
import { useAuthContext } from "@/auth/context";
import { useSeasonOrchestration } from "@/orchestration/seasons";
import { SeasonScreen } from "@/features/seasons/screens/SeasonScreen";
import { fetchJson } from "@/lib/api";
import type { SeasonSummary } from "@/lib/types";
import {
  ceremonyCodeSlug,
  leaguePath,
  parsePositiveIntParam,
  seasonPath
} from "@/lib/routes";
import { PageLoader } from "@/shared/page-state";
import "@/primitives/baseline.css";

function ResolvedSeasonPage(props: {
  seasonId: number;
  seasonIdLabel: string;
  preferCanonicalUrl: boolean;
}) {
  const { seasonId, seasonIdLabel, preferCanonicalUrl } = props;
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const s = useSeasonOrchestration(seasonId, user?.sub);

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

  return (
    <SeasonScreen
      seasonIdLabel={seasonIdLabel}
      leagueIdForBackLink={s.leagueContext?.league?.id ?? null}
      view={s}
      onDeleteSeason={async () => {
        await s.cancelSeason();
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
      }}
    />
  );
}

export function SeasonPage() {
  const { id, leagueId: leagueIdRaw, ceremonyCode } = useParams();

  const seasonIdFromLegacy = parsePositiveIntParam(id);
  const leagueId = parsePositiveIntParam(leagueIdRaw);
  const ceremonySlug = useMemo(() => ceremonyCodeSlug(ceremonyCode), [ceremonyCode]);
  const [resolvedSeasonId, setResolvedSeasonId] = useState<number | null>(
    seasonIdFromLegacy
  );
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (seasonIdFromLegacy) {
      setResolvedSeasonId(seasonIdFromLegacy);
      setResolveError(null);
      return;
    }
    if (!leagueId || !ceremonyCode) {
      setResolveError("Invalid season route");
      setResolvedSeasonId(null);
      return;
    }

    let cancelled = false;
    async function resolveSeasonId() {
      setResolving(true);
      setResolveError(null);
      const res = await fetchJson<{ seasons: SeasonSummary[] }>(
        `/leagues/${leagueId}/seasons`,
        {
          method: "GET"
        }
      );
      if (cancelled) return;
      setResolving(false);
      if (!res.ok) {
        setResolveError(res.error ?? "Could not load season");
        setResolvedSeasonId(null);
        return;
      }

      const matches = (res.data?.seasons ?? []).filter(
        (s) => ceremonyCodeSlug(s.ceremony_code ?? String(s.ceremony_id)) === ceremonySlug
      );
      if (matches.length === 0) {
        setResolveError("Season not found");
        setResolvedSeasonId(null);
        return;
      }

      const extant = matches.find((s) => s.status === "EXTANT");
      const chosen =
        extant ??
        [...matches].sort(
          (a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "")
        )[0];
      setResolvedSeasonId(chosen?.id ?? null);
    }

    void resolveSeasonId();
    return () => {
      cancelled = true;
    };
  }, [ceremonyCode, ceremonySlug, leagueId, seasonIdFromLegacy]);

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
              <Text className="baseline-textBody">
                {resolveError ?? "Could not resolve season route."}
              </Text>
            </Box>
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
    />
  );
}
