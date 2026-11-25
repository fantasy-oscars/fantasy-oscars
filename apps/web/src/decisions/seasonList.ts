import type { CircuitLeagueSummary, SeasonSummary } from "../lib/types";
import { computeSeasonCeremonyLabel } from "./league";
import { computeSeasonLifecycleLabelFromRow } from "./season";
import { circuitLeagueMemberCountLabel, circuitLeagueStatusLabel } from "./circuitLeague";
import { comingSoonNote } from "./goLive";

/*
 * A league's Seasons list: ceremony seasons and Circuit competitions in one
 * list. Players see both as seasons, told apart by a plain-language kind label.
 */

export type SeasonListItem =
  | {
      kind: "ceremony";
      id: number;
      title: string;
      statusLabel: string;
      createdAt: string;
      ceremonyId: number;
      ceremonyCode: string | null;
      /** Cancelled seasons stay in the list but do not link anywhere. */
      isNavigable: boolean;
      /** "Coming soon" while the ceremony is not live yet. */
      note: string | null;
    }
  | {
      kind: "full";
      id: number;
      title: string;
      statusLabel: string;
      createdAt: string;
      memberCount: number;
      /** "Coming soon" while the awards season is not live yet. */
      note: string | null;
    };

/** The kind line on a season card: the league page and My seasons share it. */
export function seasonKindLabel(
  input: { kind: "ceremony" } | { kind: "full"; memberCount: number }
): string {
  return input.kind === "ceremony"
    ? "Single ceremony"
    : `Full awards season · ${circuitLeagueMemberCountLabel(input.memberCount)}`;
}

/** The meta line under a card's title. */
export function seasonListKindLabel(item: SeasonListItem): string {
  return seasonKindLabel(item);
}

/** Live seasons first, then running, then upcoming, then finished ones. */
export function seasonListStatusRank(statusLabel: string): number {
  switch (statusLabel) {
    case "Drafting":
    case "Paused":
      return 0;
    case "In progress":
      return 1;
    case "Pre-draft":
      return 2;
    default:
      return 3;
  }
}

function createdAtMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/** By status rank, then newest first, then full before single and id descending. */
export function orderSeasonList(items: SeasonListItem[]): SeasonListItem[] {
  return [...items].sort(
    (a, b) =>
      seasonListStatusRank(a.statusLabel) - seasonListStatusRank(b.statusLabel) ||
      createdAtMs(b.createdAt) - createdAtMs(a.createdAt) ||
      (a.kind === b.kind ? 0 : a.kind === "full" ? -1 : 1) ||
      b.id - a.id
  );
}

export function buildSeasonList(input: {
  seasons: SeasonSummary[];
  circuitLeagues: CircuitLeagueSummary[];
}): SeasonListItem[] {
  const ceremonySeasons = input.seasons.map((s): SeasonListItem => ({
    kind: "ceremony",
    id: s.id,
    title: computeSeasonCeremonyLabel(s),
    statusLabel: computeSeasonLifecycleLabelFromRow({
      seasonStatus: s.status,
      draftStatus: s.draft_status,
      isActiveCeremony: s.is_active_ceremony,
      resultsFinalizedAt: s.ceremony_results_finalized_at
    }),
    createdAt: s.created_at,
    ceremonyId: s.ceremony_id,
    ceremonyCode: s.ceremony_code ?? null,
    isNavigable: String(s.draft_status ?? "").toUpperCase() !== "CANCELLED",
    note: comingSoonNote({ status: s.ceremony_status, startsAt: s.ceremony_starts_at })
  }));
  const fullSeasons = input.circuitLeagues.map((c): SeasonListItem => ({
    kind: "full",
    id: c.id,
    title: c.circuit_name,
    statusLabel: circuitLeagueStatusLabel(c.status),
    createdAt: c.created_at,
    memberCount: c.member_count,
    note: comingSoonNote({ status: c.circuit_status })
  }));
  return orderSeasonList([...ceremonySeasons, ...fullSeasons]);
}
