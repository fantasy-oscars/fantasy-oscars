import { Box, Text } from "@ui";
import { circuitPointsLabel } from "@/decisions/circuitStandings";
import type { CircuitStandingRow } from "@/lib/types";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";

/** Members by points, highest first; tied members share a rank. */
export function CircuitStandingsList(props: {
  rows: CircuitStandingRow[];
  viewerUserId: number | null;
  label: string;
}) {
  return (
    <Box
      component="ol"
      className={["circuit-list", "fo-listReset"].join(" ")}
      aria-label={props.label}
    >
      {props.rows.map((row) => (
        <Box key={row.member.user_id} component="li" className="circuit-row">
          <Text component="span" variant="meta" className="circuit-queueRank">
            {row.rank}
          </Text>
          <AnimalAvatarIcon avatarKey={row.member.avatar_key} size="sm" />
          <Box className="circuit-rowMain">
            <Text className="baseline-wrapAnywhere" fw="var(--fo-font-weight-bold)">
              {row.member.user_id === props.viewerUserId
                ? `${row.member.username} (you)`
                : row.member.username}
            </Text>
            <Text variant="helper">
              Nominations {circuitPointsLabel(row.nomination_points)} · Wins{" "}
              {circuitPointsLabel(row.win_points)}
            </Text>
          </Box>
          <Text
            component="span"
            className="circuit-rowActions"
            fw="var(--fo-font-weight-semibold)"
          >
            {circuitPointsLabel(row.points)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
