import { Box, Divider, Group, Stack, Text, Title } from "@ui";
import { circuitSelectionLabel } from "@/decisions/circuitRoster";
import { circuitPointsLabel, circuitScoreKindLabel } from "@/decisions/circuitStandings";
import type { CircuitCeremonyBreakdown } from "@/lib/types";

/** Each member's points at one ceremony, with the picks that earned them. */
export function CircuitScoreBreakdown(props: {
  standings: CircuitCeremonyBreakdown["standings"];
  viewerUserId: number | null;
}) {
  return (
    <Stack component="ol" gap="md" className="fo-listReset" aria-label="Points by player">
      {props.standings.map((row) => {
        const name =
          row.member.user_id === props.viewerUserId
            ? `${row.member.username} (you)`
            : row.member.username;
        const titleId = `circuit-breakdown-${row.member.user_id}`;
        return (
          <Stack
            key={row.member.user_id}
            component="li"
            gap="xs"
            aria-labelledby={titleId}
          >
            <Group justify="space-between" align="baseline" wrap="wrap" gap="sm">
              <Title
                order={3}
                variant="section"
                id={titleId}
                className="baseline-wrapAnywhere"
              >
                {row.rank}. {name}
              </Title>
              <Text fw="var(--fo-font-weight-semibold)">
                {circuitPointsLabel(row.points)}
              </Text>
            </Group>
            <Divider />
            {row.entries.length === 0 ? (
              <Text variant="helper">No points at this ceremony.</Text>
            ) : (
              <Box component="ul" className={["circuit-list", "fo-listReset"].join(" ")}>
                {row.entries.map((e) => (
                  <Box
                    key={`${e.kind}-${e.selection.id}`}
                    component="li"
                    className="circuit-row"
                  >
                    <Box className="circuit-rowMain">
                      <Text className="baseline-textBody baseline-wrapAnywhere">
                        {circuitSelectionLabel(e.selection)}
                      </Text>
                      <Text variant="helper">{circuitScoreKindLabel(e.kind)}</Text>
                    </Box>
                    <Text component="span" variant="meta" className="circuit-rowActions">
                      {circuitPointsLabel(e.points)}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
