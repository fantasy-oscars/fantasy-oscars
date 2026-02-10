import type { SeasonIndexCard } from "../orchestration/seasonsIndex";

export type SeasonsIndexGroupMode = "ceremony" | "league";

function groupBy<T>(items: T[], keyFn: (t: T) => number) {
  const m = new Map<number, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    const prev = m.get(k);
    if (prev) prev.push(it);
    else m.set(k, [it]);
  }
  return m;
}

function sortByCeremony(seasons: SeasonIndexCard[]) {
  // Newest ceremony first.
  return [...seasons].sort((a, b) => {
    if (b.ceremony_sort_ts !== a.ceremony_sort_ts) return b.ceremony_sort_ts - a.ceremony_sort_ts;
    if (a.ceremony_name !== b.ceremony_name) return a.ceremony_name.localeCompare(b.ceremony_name);
    return a.season_id - b.season_id;
  });
}

function sortByLeagueName(seasons: SeasonIndexCard[]) {
  return [...seasons].sort((a, b) => {
    const ln = a.league_name.localeCompare(b.league_name);
    if (ln !== 0) return ln;
    if (a.ceremony_name !== b.ceremony_name) return a.ceremony_name.localeCompare(b.ceremony_name);
    return a.season_id - b.season_id;
  });
}

export function computeSeasonsIndexGrouping(args: {
  mode: SeasonsIndexGroupMode;
  seasons: SeasonIndexCard[];
}): {
  seasons: SeasonIndexCard[];
  grouped: Map<number, SeasonIndexCard[]>;
  groupOrder: Array<{ id: number; label: string; sort: number }>;
} {
  const seasons =
    args.mode === "ceremony" ? sortByCeremony(args.seasons) : sortByLeagueName(args.seasons);

  const grouped =
    args.mode === "ceremony"
      ? groupBy(seasons, (s) => s.ceremony_id)
      : groupBy(seasons, (s) => s.league_id);

  const groupOrder: Array<{ id: number; label: string; sort: number }> =
    args.mode === "ceremony"
      ? Array.from(grouped.entries()).map(([id, list]) => ({
          id: Number(id),
          label: list[0]?.ceremony_name ?? `Ceremony ${id}`,
          sort: list[0]?.ceremony_sort_ts ?? 0
        }))
      : Array.from(grouped.entries()).map(([id, list]) => ({
          id: Number(id),
          label: list[0]?.league_name ?? `League ${id}`,
          sort: 0
        }));

  groupOrder.sort((a, b) => {
    if (args.mode === "ceremony") return b.sort - a.sort;
    return a.label.localeCompare(b.label);
  });

  return { seasons, grouped, groupOrder };
}

