import { computeSeasonLifecycleLabelFromRow } from "../season";
import { comingSoonNote } from "../goLive";
import { circuitLeagueStatusLabel } from "../circuitLeague";
import { seasonKindLabel } from "../seasonList";
import type {
  CeremonySummary,
  CircuitLeagueSummary,
  LeagueSummary,
  SeasonSummary
} from "../../lib/types";

type SeasonIndexCardBase = {
  /** A ceremony season's id, or a full awards season's. */
  season_id: number;
  league_id: number;
  league_name: string;
  /** The ceremony's name, or the awards season's name for a full season. */
  ceremony_name: string;
  ceremony_sort_ts: number;
  status_label: string;
  /** "Single ceremony", or "Full awards season · N members". */
  kind_label: string;
  is_navigable: boolean;
  /** "Coming soon" while the ceremony or awards season is not live yet. */
  note: string | null;
};

export type SeasonIndexCard =
  | (SeasonIndexCardBase & {
      kind: "ceremony";
      ceremony_id: number;
      ceremony_code: string | null;
    })
  | (SeasonIndexCardBase & { kind: "full" });

function ceremonySortTs(ceremony: CeremonySummary): number {
  const ts = ceremony.starts_at ? Date.parse(ceremony.starts_at) : NaN;
  if (Number.isFinite(ts)) return ts;
  const year = typeof ceremony.year === "number" ? ceremony.year : NaN;
  return Number.isFinite(year) ? Date.UTC(year, 0, 1) : 0;
}

function statusLabel(season: SeasonSummary): string {
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
  /** Each league's full awards seasons; omitted when none were loaded. */
  circuitResults?: Array<{
    league: LeagueSummary;
    circuitLeagues: CircuitLeagueSummary[];
  }>;
  ceremonyById: Map<number, CeremonySummary>;
}): SeasonIndexCard[] {
  const { seasonResults, circuitResults = [], ceremonyById } = args;
  const ceremonyCards = seasonResults.flatMap(({ league, seasons }) =>
    seasons.map((s): SeasonIndexCard => {
      const ceremony = ceremonyById.get(s.ceremony_id);
      return {
        kind: "ceremony",
        season_id: s.id,
        league_id: league.id,
        league_name: league.name,
        ceremony_id: s.ceremony_id,
        ceremony_code: s.ceremony_code ?? null,
        ceremony_name: ceremony?.name ?? `Ceremony ${s.ceremony_id}`,
        ceremony_sort_ts: ceremony ? ceremonySortTs(ceremony) : 0,
        status_label: statusLabel(s),
        kind_label: seasonKindLabel({ kind: "ceremony" }),
        is_navigable: String(s.draft_status ?? "").toUpperCase() !== "CANCELLED",
        note:
          s.status === "EXTANT"
            ? comingSoonNote({
                status: s.ceremony_status ?? ceremony?.status,
                startsAt: ceremony?.starts_at ?? s.ceremony_starts_at
              })
            : null
      };
    })
  );
  const fullCards = circuitResults.flatMap(({ league, circuitLeagues }) =>
    circuitLeagues.map((c): SeasonIndexCard => ({
      kind: "full",
      season_id: c.id,
      league_id: league.id,
      league_name: league.name,
      ceremony_name: c.circuit_name,
      ceremony_sort_ts: 0,
      status_label: circuitLeagueStatusLabel(c.status),
      kind_label: seasonKindLabel({ kind: "full", memberCount: c.member_count }),
      is_navigable: true,
      note: comingSoonNote({ status: c.circuit_status })
    }))
  );
  return [...ceremonyCards, ...fullCards];
}
