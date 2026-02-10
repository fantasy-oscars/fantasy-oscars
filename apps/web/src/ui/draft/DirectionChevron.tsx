import { Text } from "@mantine/core";

export function DirectionChevron(props: { direction: "FORWARD" | "REVERSE" | null }) {
  const glyph = props.direction === "REVERSE" ? "chevron_left" : "chevron_right";
  return (
    <Text component="span" className="drh-chevron mi-icon mi-icon-tiny" aria-hidden="true">
      {glyph}
    </Text>
  );
}

