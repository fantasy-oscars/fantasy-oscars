import { Box, Button, Group, Stack, Text, Title } from "@ui";
import { Link } from "react-router-dom";
import { EmptyState, StandardCard } from "@/primitives";
import { statusTone } from "@/decisions/statusTone";
import { StatusPill } from "@/shared/pills";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";
import { circuitLeaguePath, leagueSeasonCreatePath, seasonPath } from "@/lib/routes";

const CREATE_LOCKED_NOTE_ID = "league-seasons-create-locked-note";

export function LeagueSeasonsSection(props: {
  leagueId: number;
  leagueName?: string | null;
  canCreateSeason: boolean;
  seasons: Array<{
    id: number;
    ceremonyId: number;
    ceremonyCode?: string | null;
    ceremonyLabel: string;
    statusLabel: string;
    isNavigable: boolean;
  }>;
  /** The league's Circuit competitions; players see them as seasons too. */
  circuits?: Array<{ id: number; name: string; statusLabel: string; meta: string }>;
  /** Circuits a commissioner can start here. */
  startableCircuits?: Array<{ id: number; name: string }>;
  startingCircuit?: boolean;
  circuitStatus?: ApiResult | null;
  onStartCircuit?: (circuitId: number) => void | Promise<unknown>;
}) {
  const {
    leagueId,
    leagueName,
    canCreateSeason,
    seasons,
    circuits = [],
    startableCircuits = [],
    startingCircuit = false,
    circuitStatus = null,
    onStartCircuit
  } = props;
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3} variant="section">
          Seasons
        </Title>
        <Button
          component={Link}
          to={leagueSeasonCreatePath({ leagueId, leagueName })}
          disabled={!canCreateSeason}
          aria-describedby={canCreateSeason ? undefined : CREATE_LOCKED_NOTE_ID}
        >
          Create season
        </Button>
      </Group>
      {canCreateSeason ? null : (
        <Text id={CREATE_LOCKED_NOTE_ID} variant="helper">
          Commissioner permission required.
        </Text>
      )}

      {seasons.length === 0 && circuits.length === 0 ? (
        <EmptyState>No seasons yet.</EmptyState>
      ) : (
        <Stack component="ul" gap="sm" className="fo-listReset">
          {circuits.map((c) => (
            <Box key={`circuit-${c.id}`} component="li">
              <StandardCard
                component={Link}
                to={circuitLeaguePath({ leagueId, leagueName, circuitLeagueId: c.id })}
                interactive
              >
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                  <Box miw="var(--fo-space-0)">
                    <Text className="baseline-textCardTitle baseline-wrapAnywhere">
                      {c.name}
                    </Text>
                    <Text variant="meta">{c.meta}</Text>
                  </Box>
                  <StatusPill {...statusTone(c.statusLabel)}>{c.statusLabel}</StatusPill>
                </Group>
              </StandardCard>
            </Box>
          ))}
          {seasons.map((s) => (
            <Box key={s.id} component="li">
              <StandardCard
                {...(s.isNavigable
                  ? {
                      component: Link,
                      to: seasonPath({
                        leagueId,
                        leagueName,
                        ceremonyCode: s.ceremonyCode,
                        ceremonyId: s.ceremonyId
                      }),
                      interactive: true
                    }
                  : {})}
              >
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                  <Box miw="var(--fo-space-0)">
                    <Text className="baseline-textCardTitle">{s.ceremonyLabel}</Text>
                  </Box>
                  <StatusPill {...statusTone(s.statusLabel)}>{s.statusLabel}</StatusPill>
                </Group>
              </StandardCard>
            </Box>
          ))}
        </Stack>
      )}

      {startableCircuits.map((c) => (
        <StandardCard key={`startable-${c.id}`} tone="nested">
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <Box miw="var(--fo-space-0)">
              <Text className="baseline-textCardTitle baseline-wrapAnywhere">
                {c.name}
              </Text>
              <Text variant="helper">Not started in this league yet.</Text>
            </Box>
            <Button
              variant="secondary"
              onClick={() => void onStartCircuit?.(c.id)}
              disabled={startingCircuit}
              aria-label={`Start ${c.name}`}
            >
              Start
            </Button>
          </Group>
        </StandardCard>
      ))}
      <FormStatus loading={false} result={circuitStatus} />
    </Stack>
  );
}
