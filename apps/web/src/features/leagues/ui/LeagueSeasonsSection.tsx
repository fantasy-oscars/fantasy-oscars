import { Box, Button, Group, Stack, Text, Title } from "@ui";
import { Link } from "react-router-dom";
import { EmptyState, StandardCard } from "@/primitives";
import { statusTone } from "@/decisions/statusTone";
import { StatusPill } from "@/shared/pills";
import { leagueSeasonCreatePath, seasonPath } from "@/lib/routes";

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
}) {
  const { leagueId, leagueName, canCreateSeason, seasons } = props;
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

      {seasons.length === 0 ? (
        <EmptyState>No seasons yet.</EmptyState>
      ) : (
        <Stack component="ul" gap="sm" className="fo-listReset">
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
    </Stack>
  );
}
