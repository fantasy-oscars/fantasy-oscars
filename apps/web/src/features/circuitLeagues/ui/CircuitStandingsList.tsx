import { Box, Text } from "@ui";
import { circuitPointsLabel } from "@/decisions/circuitStandings";
import type { CircuitStandingRow } from "@/lib/types";
import { PlayerName } from "@/shared/PlayerName";

/** Members by points, highest first; tied members share a rank. */
export function CircuitStandingsList(props: {
  rows: CircuitStandingRow[];
  viewerUserId: number | null;
  label: string;
}) {
  return (
    <Box
      component="ol"
      className={["season-list", "fo-listReset"].join(" ")}
      aria-label={props.label}
    >
      {props.rows.map((row) => (
        <Box
          key={row.member.user_id}
          component="li"
          className={["season-row", "is-twoLine", "season-standingRow"].join(" ")}
        >
          <Text component="span" variant="meta" className="season-rowRank">
            {row.rank}
          </Text>
          <Box className="season-rowMain">
            <PlayerName
              name={row.member.username}
              avatarKey={row.member.avatar_key}
              density="roomy"
              wrap="anywhere"
              bold
              isViewer={row.member.user_id === props.viewerUserId}
            >
              <Text variant="helper">
                Nominations {circuitPointsLabel(row.nomination_points)} · Wins{" "}
                {circuitPointsLabel(row.win_points)}
              </Text>
            </PlayerName>
          </Box>
          <Text component="span" className="season-rowFigure">
            {circuitPointsLabel(row.points)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
