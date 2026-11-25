import { Box, Divider, Group, Stack, Text, Title } from "@ui";
import {
  circuitChipLabel,
  circuitChipStatusLabel,
  type CircuitPriorityEntry
} from "@/decisions/circuitWaivers";
import { PlayerName } from "@/shared/PlayerName";

/**
 * Rolling waiver priority, first in line first, with each member's priority
 * passes (chips in the API).
 * Anyone who wins a claim moves to the bottom once after the run.
 */
export function CircuitPriorityList(props: {
  entries: CircuitPriorityEntry[];
  viewerUserId: number | null;
}) {
  const { entries } = props;
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-priority-title">
      <Title order={3} variant="section" id="circuit-priority-title">
        Waiver priority
      </Title>
      <Divider />
      <Text variant="helper" id="circuit-priority-help">
        Claims run in this order. A claim with a priority pass runs first, earliest missed
        pick first. Everyone who wins a claim moves to the bottom once.
      </Text>
      {entries.length === 0 ? (
        <Text className="baseline-textBody">
          Priority is set when the draft finishes.
        </Text>
      ) : (
        <Box
          component="ol"
          className={["season-list", "fo-listReset"].join(" ")}
          aria-label="Waiver priority"
          aria-describedby="circuit-priority-help"
        >
          {entries.map((entry) => (
            <Box
              key={entry.user_id}
              component="li"
              className={[
                "season-row",
                entry.chips.length > 0 ? "is-twoLine" : "",
                "season-priorityRow"
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <Text component="span" variant="meta" className="season-rowRank">
                {entry.waiver_priority ?? "–"}
              </Text>
              <Box className="season-rowMain">
                <PlayerName
                  name={entry.username}
                  avatarKey={entry.avatarKey}
                  density="roomy"
                  wrap="anywhere"
                  bold
                  isViewer={entry.user_id === props.viewerUserId}
                >
                  {entry.chips.length > 0 ? (
                    <Group gap="xs" wrap="wrap">
                      {entry.chips.map((chip) => (
                        <Text
                          key={chip.id}
                          variant="helper"
                          className="baseline-textBody"
                        >
                          {circuitChipLabel(chip.original_pick_number)}:{" "}
                          {circuitChipStatusLabel(chip.status)}
                        </Text>
                      ))}
                    </Group>
                  ) : null}
                </PlayerName>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}
