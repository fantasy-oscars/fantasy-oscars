import { Link } from "react-router-dom";
import { Anchor, Box, Text } from "@ui";
import {
  circuitCeremonyDatesLabel,
  circuitCeremonyName,
  circuitPointsLabel
} from "@/decisions/circuitStandings";
import type { CircuitStandings } from "@/lib/types";

/** The ceremonies that count toward the season, each linking to its points. */
export function CircuitCeremonyPointsList(props: {
  ceremonies: CircuitStandings["ceremonies"];
  pathOf: (ceremonyId: number) => string;
}) {
  if (props.ceremonies.length === 0) {
    return (
      <Text className="baseline-textBody">
        No ceremonies count toward this season yet.
      </Text>
    );
  }
  return (
    <Box
      component="ul"
      className={["circuit-list", "fo-listReset"].join(" ")}
      aria-label="Points by ceremony"
    >
      {props.ceremonies.map((c) => (
        <Box key={c.id} component="li" className="circuit-row">
          <Box className="circuit-rowMain">
            <Anchor
              component={Link}
              to={props.pathOf(c.id)}
              fw="var(--fo-font-weight-bold)"
              className="baseline-wrapAnywhere"
            >
              {circuitCeremonyName(c)}
            </Anchor>
            <Text variant="helper" className="baseline-wrapAnywhere">
              {c.event.name} · {circuitCeremonyDatesLabel(c)}
            </Text>
          </Box>
          <Text component="span" variant="meta" className="circuit-rowActions">
            {circuitPointsLabel(c.points_awarded)} awarded
          </Text>
        </Box>
      ))}
    </Box>
  );
}
