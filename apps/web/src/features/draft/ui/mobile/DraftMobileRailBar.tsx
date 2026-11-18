import { Box, Group, Text, UnstyledButton } from "@ui";

export type DraftMobileRail<Id extends string> = {
  id: Id;
  icon: string;
  label: string;
  enabled: boolean;
  /** The button's title; defaults to the label. */
  title?: string;
};

/**
 * The phone draft room's bottom bar: one button per rail, each toggling that
 * rail in place of the board. Shared by the ceremony and season draft rooms.
 */
export function DraftMobileRailBar<Id extends string>(props: {
  rails: Array<DraftMobileRail<Id>>;
  activeRail: Id | null;
  onToggle: (rail: Id) => void;
}) {
  return (
    <Box className="dr-mobileBottomBar" role="navigation" aria-label="Draft rails">
      <Group justify="space-between" gap="var(--fo-space-0)" wrap="nowrap">
        {props.rails.map((rail) => (
          <UnstyledButton
            key={rail.id}
            type="button"
            className={[
              "dr-mobileRailBtn",
              props.activeRail === rail.id ? "is-active" : "",
              rail.enabled ? "" : "is-disabled"
            ].join(" ")}
            aria-label={rail.label}
            aria-disabled={!rail.enabled}
            title={rail.title ?? rail.label}
            onClick={() => {
              if (rail.enabled) props.onToggle(rail.id);
            }}
          >
            <Text component="span" className="mi-icon" aria-hidden="true">
              {rail.icon}
            </Text>
          </UnstyledButton>
        ))}
      </Group>
    </Box>
  );
}
