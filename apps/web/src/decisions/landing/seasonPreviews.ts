import type { LeagueSummary, SeasonSummary } from "../../lib/types";

export type LandingSeasonPreview = SeasonSummary & {
  league_name: string;
  league_code: string;
  ceremony_name: string | null;
};

export function computeActiveLandingSeasonPreviews(
  seasonResults: Array<{ league: LeagueSummary; seasons: SeasonSummary[] }>,
  ceremonyNameById: Map<number, string>
): LandingSeasonPreview[] {
  const allSeasons: LandingSeasonPreview[] = seasonResults.flatMap(
    ({ league, seasons }) =>
      seasons.map((s) => ({
        ...s,
        league_name: league.name,
        league_code: league.code,
        ceremony_name: ceremonyNameById.get(s.ceremony_id) ?? null
      }))
  );

  const activeSeasons = allSeasons
    .filter((s) => Boolean(s.is_active_ceremony))
    .filter((s) => s.status !== "CANCELLED")
    .filter((s) => String(s.draft_status ?? "").toUpperCase() !== "CANCELLED");

  activeSeasons.sort((a, b) => {
    const at = Date.parse(a.created_at ?? "") || 0;
    const bt = Date.parse(b.created_at ?? "") || 0;
    if (bt !== at) return bt - at;
    return a.id - b.id;
  });

  return activeSeasons;
}
