import { Box, Button, Group, Stack, Text, Title } from "@ui";
import { Link } from "react-router-dom";
import { StandardCard } from "@/primitives";
import { StatusPill } from "@/shared/pills";
import { leagueSeasonCreatePath, seasonPath } from "@/lib/routes";

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
  }>;
}) {
  const { leagueId, leagueName, canCreateSeason, seasons } = props;
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3}>Seasons</Title>
        <Button
          component={Link}
          to={leagueSeasonCreatePath({ leagueId, leagueName })}
          disabled={!canCreateSeason}
          title={canCreateSeason ? undefined : "Commissioner permission required"}
        >
          Create season
        </Button>
      </Group>

      {seasons.length === 0 ? (
        <Text className="baseline-textBody">No seasons yet.</Text>
      ) : (
        <Stack component="ul" gap="sm" className="fo-listReset">
          {seasons.map((s) => (
            <Box key={s.id} component="li">
              <StandardCard
                component={Link}
                to={seasonPath({
                  leagueId,
                  leagueName,
                  ceremonyCode: s.ceremonyCode,
                  ceremonyId: s.ceremonyId
                })}
                interactive
              >
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                  <Box miw="var(--fo-space-0)">
                    <Text className="baseline-textCardTitle">{s.ceremonyLabel}</Text>
                  </Box>
                  <StatusPill>{s.statusLabel.toUpperCase()}</StatusPill>
                </Group>
              </StandardCard>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
