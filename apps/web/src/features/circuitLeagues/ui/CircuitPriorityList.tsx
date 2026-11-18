import { Box, Divider, Group, Stack, Text, Title } from "@ui";
import {
  circuitChipLabel,
  circuitChipStatusLabel,
  type CircuitPriorityEntry
} from "@/decisions/circuitWaivers";

/**
 * Rolling waiver priority, first in line first, with each member's chips.
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
        Priority and chips
      </Title>
      <Divider />
      <Text variant="helper" id="circuit-priority-help">
        Claims with a chip run first, earliest missed pick first. Then claims run in this
        order. Everyone who wins a claim moves to the bottom once.
      </Text>
      {entries.length === 0 ? (
        <Text className="baseline-textBody">
          Priority is set when the draft finishes.
        </Text>
      ) : (
        <Box
          component="ol"
          className={["circuit-list", "fo-listReset"].join(" ")}
          aria-label="Waiver priority"
          aria-describedby="circuit-priority-help"
        >
          {entries.map((entry) => (
            <Box key={entry.user_id} component="li" className="circuit-row">
              <Text component="span" variant="meta" className="circuit-queueRank">
                {entry.waiver_priority ?? "–"}
              </Text>
              <Box className="circuit-rowMain">
                <Text className="baseline-wrapAnywhere" fw="var(--fo-font-weight-bold)">
                  {entry.user_id === props.viewerUserId
                    ? `${entry.username} (you)`
                    : entry.username}
                </Text>
                {entry.chips.length > 0 ? (
                  <Group gap="xs" wrap="wrap">
                    {entry.chips.map((chip) => (
                      <Text key={chip.id} variant="helper" className="baseline-textBody">
                        {circuitChipLabel(chip.original_pick_number)}:{" "}
                        {circuitChipStatusLabel(chip.status)}
                      </Text>
                    ))}
                  </Group>
                ) : null}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  );
}
