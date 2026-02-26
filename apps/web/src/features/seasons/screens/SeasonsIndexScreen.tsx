import { useMemo, useState } from "react";
import { Box, Group, SegmentedControl, Skeleton, Stack, Text, Title } from "@ui";
import { Link } from "react-router-dom";
import { StandardCard } from "@/primitives";
import { seasonPath } from "@/lib/routes";
import "@/primitives/baseline.css";
import type { SeasonIndexCard, SeasonsIndexView } from "@/orchestration/seasonsIndex";
import {
  computeSeasonsIndexGrouping,
  type SeasonsIndexGroupMode
} from "@/decisions/seasonsIndex";

export function SeasonsIndexScreen(props: { view: SeasonsIndexView }) {
  const { view } = props;
  const [mode, setMode] = useState<SeasonsIndexGroupMode>("ceremony");

  const { seasons, grouped, groupOrder } = useMemo(() => {
    if (view.state !== "ready") {
      return {
        seasons: [] as SeasonIndexCard[],
        grouped: new Map<number, SeasonIndexCard[]>(),
        groupOrder: [] as Array<{ id: number; label: string; sort: number }>
      };
    }
    return computeSeasonsIndexGrouping({ mode, seasons: view.seasons });
  }, [mode, view]);

  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack gap="md">
          <Title order={2} className="baseline-textHeroTitle">
            Seasons
          </Title>

          <SegmentedControl
            value={mode}
            onChange={(v) => setMode(v as SeasonsIndexGroupMode)}
            data={[
              { value: "ceremony", label: "By Ceremony" },
              { value: "league", label: "By League" }
            ]}
          />

          {view.state === "loading" ? (
            <Stack gap="lg" role="status" aria-label="Loading seasons">
              {Array.from({ length: 2 }).map((_, gIdx) => (
                <Stack key={gIdx} gap="sm">
                  <Skeleton height="var(--fo-font-size-sm)" width="38%" />
                  <Stack gap="sm">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <StandardCard key={idx}>
                        <Stack gap="var(--fo-space-dense-2)">
                          <Skeleton height="var(--fo-font-size-sm)" width="55%" />
                          <Group className="baseline-metaRow" gap="sm" wrap="nowrap">
                            <Skeleton height="var(--fo-font-size-xs)" width="45%" />
                            <Skeleton height="var(--fo-font-size-xs)" width="26%" />
                          </Group>
                        </Stack>
                      </StandardCard>
                    ))}
                  </Stack>
                </Stack>
              ))}
            </Stack>
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
                          to={seasonPath({
                            leagueId: s.league_id,
                            leagueName: s.league_name,
                            ceremonyCode: s.ceremony_code,
                            ceremonyId: s.ceremony_id
                          })}
                        >
                          <Stack gap="var(--fo-space-dense-2)">
                            <Text className="baseline-textCardTitle">
                              {mode === "ceremony" ? s.league_name : s.ceremony_name}
                            </Text>
                            <Group className="baseline-metaRow" gap="sm" wrap="nowrap">
                              <Text className="baseline-textMeta">
                                {mode === "ceremony" ? s.ceremony_name : s.league_name}
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
