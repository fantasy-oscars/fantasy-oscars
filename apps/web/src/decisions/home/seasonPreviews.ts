import type { LeagueSummary, SeasonSummary } from "../../lib/types";

export type HomeSeasonPreview = SeasonSummary & {
  league_name: string;
  league_code: string;
};

export function computeActiveSeasonPreviews(
  seasonResults: Array<{ league: LeagueSummary; seasons: SeasonSummary[] }>
): HomeSeasonPreview[] {
  const allSeasons: HomeSeasonPreview[] = seasonResults.flatMap(({ league, seasons }) =>
    seasons.map((s) => ({
      ...s,
      league_name: league.name,
      league_code: league.code
    }))
  );

  const activeSeasons = allSeasons
    .filter((s) => Boolean(s.is_active_ceremony))
    .filter((s) => s.status !== "CANCELLED");

  activeSeasons.sort((a, b) => {
    const at = Date.parse(a.created_at ?? "") || 0;
    const bt = Date.parse(b.created_at ?? "") || 0;
    if (bt !== at) return bt - at;
    return a.id - b.id;
  });

  return activeSeasons;
}
