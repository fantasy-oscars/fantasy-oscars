import { Box, Button, Group, Stack, Text, Title } from "@ui";
import { Link } from "react-router-dom";
import { EmptyState, StandardCard } from "@/primitives";
import { statusTone } from "@/decisions/statusTone";
import { seasonListKindLabel, type SeasonListItem } from "@/decisions/seasonList";
import { StatusPill } from "@/shared/pills";
import { circuitLeaguePath, leagueSeasonCreatePath, seasonPath } from "@/lib/routes";

function seasonLink(
  s: SeasonListItem,
  league: { leagueId: number; leagueName?: string | null }
): string | null {
  if (s.kind === "full") return circuitLeaguePath({ ...league, circuitLeagueId: s.id });
  if (!s.isNavigable) return null;
  return seasonPath({
    ...league,
    ceremonyCode: s.ceremonyCode,
    ceremonyId: s.ceremonyId
  });
}

export function LeagueSeasonsSection(props: {
  leagueId: number;
  leagueName?: string | null;
  /** Commissioners see Create season; players see only the list. */
  canCreateSeason: boolean;
  /** Both kinds of season, already in display order. */
  seasons: SeasonListItem[];
}) {
  const { leagueId, leagueName, canCreateSeason, seasons } = props;
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3} variant="section">
          Seasons
        </Title>
        {canCreateSeason ? (
          <Button
            component={Link}
            to={leagueSeasonCreatePath({ leagueId, leagueName })}
            variant="primary"
          >
            Create season
          </Button>
        ) : null}
      </Group>
      {seasons.length === 0 && canCreateSeason ? (
        <Text variant="helper">
          Create one for a single ceremony or the full awards season.
        </Text>
      ) : null}

      {seasons.length === 0 ? (
        <EmptyState>No seasons yet.</EmptyState>
      ) : (
        <Stack component="ul" gap="sm" className="fo-listReset">
          {seasons.map((s) => {
            const to = seasonLink(s, { leagueId, leagueName });
            return (
              <Box key={`${s.kind}-${s.id}`} component="li">
                <StandardCard {...(to ? { component: Link, to, interactive: true } : {})}>
                  <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                    <Box miw="var(--fo-space-0)">
                      <Text className="baseline-textCardTitle baseline-wrapAnywhere">
                        {s.title}
                      </Text>
                      <Text variant="meta">{seasonListKindLabel(s)}</Text>
                    </Box>
                    <StatusPill {...statusTone(s.statusLabel)}>
                      {s.statusLabel}
                    </StatusPill>
                  </Group>
                </StandardCard>
              </Box>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
