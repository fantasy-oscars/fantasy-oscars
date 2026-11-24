import { computeSeasonLifecycleLabelFromRow, type SeasonStatusLabel } from "../season";
import type { CeremonySummary, LeagueSummary, SeasonSummary } from "../../lib/types";

export type SeasonIndexCard = {
  season_id: number;
  league_id: number;
  league_name: string;
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string;
  ceremony_sort_ts: number;
  status_label: SeasonStatusLabel;
  is_navigable: boolean;
};

function ceremonySortTs(ceremony: CeremonySummary): number {
  const ts = ceremony.starts_at ? Date.parse(ceremony.starts_at) : NaN;
  if (Number.isFinite(ts)) return ts;
  const year = typeof ceremony.year === "number" ? ceremony.year : NaN;
  return Number.isFinite(year) ? Date.UTC(year, 0, 1) : 0;
}

function statusLabel(season: SeasonSummary): SeasonStatusLabel {
  return computeSeasonLifecycleLabelFromRow({
    seasonStatus: season.status,
    draftStatus: season.draft_status,
    // A cancelled season reads as Closed, like one whose ceremony is no longer active.
    isActiveCeremony: season.status === "EXTANT" ? season.is_active_ceremony : false,
    resultsFinalizedAt: season.ceremony_results_finalized_at
  });
}

export function buildSeasonIndexCards(args: {
  seasonResults: Array<{ league: LeagueSummary; seasons: SeasonSummary[] }>;
  ceremonyById: Map<number, CeremonySummary>;
}): SeasonIndexCard[] {
  const { seasonResults, ceremonyById } = args;
  return seasonResults.flatMap(({ league, seasons }) =>
    seasons.map((s) => {
      const ceremony = ceremonyById.get(s.ceremony_id);
      return {
        season_id: s.id,
        league_id: league.id,
        league_name: league.name,
        ceremony_id: s.ceremony_id,
        ceremony_code: s.ceremony_code ?? null,
        ceremony_name: ceremony?.name ?? `Ceremony ${s.ceremony_id}`,
        ceremony_sort_ts: ceremony ? ceremonySortTs(ceremony) : 0,
        status_label: statusLabel(s),
        is_navigable: String(s.draft_status ?? "").toUpperCase() !== "CANCELLED"
      };
    })
  );
}
