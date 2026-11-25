import type { SeasonIndexCard } from "../orchestration/seasonsIndex";

export type SeasonsIndexGroupMode = "ceremony" | "league";

/** The "By Ceremony" group that holds every full awards season. */
export const FULL_SEASONS_GROUP_KEY = "full";
export const FULL_SEASONS_GROUP_LABEL = "Full awards seasons";

function groupBy<T>(items: T[], keyFn: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    const prev = m.get(k);
    if (prev) prev.push(it);
    else m.set(k, [it]);
  }
  return m;
}

function sortByCeremony(seasons: SeasonIndexCard[]) {
  // Full seasons first, then newest ceremony first.
  return [...seasons].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "full" ? -1 : 1;
    if (b.ceremony_sort_ts !== a.ceremony_sort_ts)
      return b.ceremony_sort_ts - a.ceremony_sort_ts;
    if (a.ceremony_name !== b.ceremony_name)
      return a.ceremony_name.localeCompare(b.ceremony_name);
    return a.season_id - b.season_id;
  });
}

function sortByLeagueName(seasons: SeasonIndexCard[]) {
  return [...seasons].sort((a, b) => {
    const ln = a.league_name.localeCompare(b.league_name);
    if (ln !== 0) return ln;
    if (a.kind !== b.kind) return a.kind === "full" ? -1 : 1;
    if (a.ceremony_name !== b.ceremony_name)
      return a.ceremony_name.localeCompare(b.ceremony_name);
    return a.season_id - b.season_id;
  });
}

function ceremonyGroupKey(s: SeasonIndexCard): string {
  return s.kind === "full" ? FULL_SEASONS_GROUP_KEY : `ceremony-${s.ceremony_id}`;
}

export function computeSeasonsIndexGrouping(args: {
  mode: SeasonsIndexGroupMode;
  seasons: SeasonIndexCard[];
}): {
  seasons: SeasonIndexCard[];
  grouped: Map<string, SeasonIndexCard[]>;
  groupOrder: Array<{ id: string; label: string; sort: number }>;
} {
  const seasons =
    args.mode === "ceremony"
      ? sortByCeremony(args.seasons)
      : sortByLeagueName(args.seasons);

  const grouped =
    args.mode === "ceremony"
      ? groupBy(seasons, ceremonyGroupKey)
      : groupBy(seasons, (s) => `league-${s.league_id}`);

  const groupOrder: Array<{ id: string; label: string; sort: number }> =
    args.mode === "ceremony"
      ? Array.from(grouped.entries()).map(([id, list]) => ({
          id,
          label:
            id === FULL_SEASONS_GROUP_KEY
              ? FULL_SEASONS_GROUP_LABEL
              : (list[0]?.ceremony_name ?? id),
          sort:
            id === FULL_SEASONS_GROUP_KEY ? Infinity : (list[0]?.ceremony_sort_ts ?? 0)
        }))
      : Array.from(grouped.entries()).map(([id, list]) => ({
          id,
          label: list[0]?.league_name ?? id,
          sort: 0
        }));

  groupOrder.sort((a, b) => {
    if (args.mode === "ceremony") {
      if (a.sort === b.sort) return a.label.localeCompare(b.label);
      return b.sort > a.sort ? 1 : -1;
    }
    return a.label.localeCompare(b.label);
  });

  return { seasons, grouped, groupOrder };
}
