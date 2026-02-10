import { useMemo, useState } from "react";
import { Box, Group, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { StandardCard } from "../../primitives";
import "../../primitives/baseline.css";
import type {
  SeasonIndexCard,
  SeasonsIndexView
} from "../../orchestration/seasonsIndex";

type GroupMode = "ceremony" | "league";

function groupBy<T, K extends string | number>(items: T[], keyFn: (t: T) => K) {
  const m = new Map<K, T[]>();
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
    if (a.ceremony_name !== b.ceremony_name)
      return a.ceremony_name.localeCompare(b.ceremony_name);
    return a.season_id - b.season_id;
  });
}

export function SeasonsIndexScreen(props: { view: SeasonsIndexView }) {
  const { view } = props;
  const [mode, setMode] = useState<GroupMode>("ceremony");

  const seasons = useMemo(() => {
    if (view.state !== "ready") return [];
    return mode === "ceremony"
      ? sortByCeremony(view.seasons)
      : sortByLeagueName(view.seasons);
  }, [mode, view]);

  const grouped =
    mode === "ceremony"
      ? groupBy(seasons, (s) => s.ceremony_id)
      : groupBy(seasons, (s) => s.league_id);

  const groupOrder: Array<{ id: number; label: string; sort: number }> =
    view.state !== "ready"
      ? []
      : mode === "ceremony"
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
    if (mode === "ceremony") return b.sort - a.sort;
    return a.label.localeCompare(b.label);
  });

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack gap="md">
          <Title order={2} className="baseline-textHeroTitle">
            Seasons
          </Title>

          <SegmentedControl
            value={mode}
            onChange={(v) => setMode(v as GroupMode)}
            data={[
              { value: "ceremony", label: "By Ceremony" },
              { value: "league", label: "By League" }
            ]}
          />

          {view.state === "loading" ? (
            <StandardCard>
              <Text className="baseline-textBody">Loading…</Text>
            </StandardCard>
          ) : view.state === "error" ? (
            <StandardCard>
              <Text className="baseline-textBody">{view.message}</Text>
            </StandardCard>
          ) : seasons.length === 0 ? (
            <StandardCard>
              <Text className="baseline-textBody">No seasons yet.</Text>
            </StandardCard>
          ) : (
            <Stack gap="lg">
              {groupOrder.map((g) => {
                const list = grouped.get(g.id) ?? [];
                return (
                  <Stack key={g.id} gap="sm">
                    <Text className="baseline-textSectionHeader">{g.label}</Text>
                    <Stack gap="sm">
                      {list.map((s) => (
                        <StandardCard
                          key={s.season_id}
                          interactive
                          component={Link}
                          to={`/seasons/${s.season_id}`}
                        >
                          <Stack gap={10}>
                            <Text className="baseline-textCardTitle">
                              {s.league_name} — {s.ceremony_name}
                            </Text>
                            <Group className="baseline-metaRow" gap="sm" wrap="nowrap">
                              <Text className="baseline-textMeta">
                                {s.league_name} · {s.ceremony_name}
                              </Text>
                              <Text
                                component="span"
                                className={[
                                  "baseline-statusPill",
                                  "baseline-textMeta"
                                ].join(" ")}
                              >
                                {s.status_label}
                              </Text>
                            </Group>
                          </Stack>
                        </StandardCard>
                      ))}
                    </Stack>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
