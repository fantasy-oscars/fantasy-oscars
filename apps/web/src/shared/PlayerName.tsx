import { Box, Text, VisuallyHidden } from "@ui";
import { AnimalAvatarIcon } from "./animalAvatarIcon";

/**
 * A player listed by name: their animal, then the username. It is the one
 * way a list draws a player. Dense rows (beside pills or log data) use the
 * 22 px avatar and inherit the row's text size; roomy lists of people use the
 * 26 px avatar at body size. The viewer is drawn like everyone else; screen
 * readers hear ", you" after their name. Never interactive by itself: a row
 * that links wraps the whole row.
 */
export function PlayerName(props: {
  name: string;
  avatarKey?: string | null;
  density?: "dense" | "roomy";
  isViewer?: boolean;
  /** One line with an ellipsis (default), or wrap anywhere to show the name in full. */
  wrap?: "ellipsis" | "anywhere";
  /** Bold for lists that set it (leaderboard, priority). */
  bold?: boolean;
  /** A second line under the name; the avatar then aligns to the first line. */
  children?: React.ReactNode;
}) {
  const density = props.density ?? "dense";
  const wrap = props.wrap ?? "ellipsis";
  return (
    <Box
      component="span"
      className={["fo-playerName", `is-${density}`, props.children ? "has-subline" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <AnimalAvatarIcon
        avatarKey={props.avatarKey}
        size={density === "dense" ? "sm" : "lg"}
      />
      <Box component="span" className="fo-playerName-body">
        <Text
          component="span"
          className={[
            "fo-playerName-text",
            density === "roomy" ? "baseline-textBody" : "",
            wrap === "anywhere" ? "baseline-wrapAnywhere" : "is-ellipsis"
          ]
            .filter(Boolean)
            .join(" ")}
          fw={props.bold ? "var(--fo-font-weight-bold)" : undefined}
          title={wrap === "ellipsis" ? props.name : undefined}
        >
          {props.name}
          {props.isViewer ? (
            <VisuallyHidden component="span">, you</VisuallyHidden>
          ) : null}
        </Text>
        {props.children}
      </Box>
    </Box>
  );
}
