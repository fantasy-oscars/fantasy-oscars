import { Box, Button, Divider, Group, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import {
  circuitCategoryCountLabel,
  circuitRosterByCategory,
  circuitRosterCountLabel,
  circuitSelectionLabel,
  type CircuitRosterEntry
} from "@/decisions/circuitRoster";
import type { ApiResult, CircuitRoster } from "@/lib/types";

/** A roster grouped by category, with a Drop button per pick on the viewer's own. */
export function CircuitRosterList(props: {
  roster: CircuitRoster;
  canDrop: boolean;
  droppingSelectionId: number | null;
  dropStatus: ApiResult | null;
  onDrop: (entry: CircuitRosterEntry) => void;
}) {
  const { roster, canDrop, droppingSelectionId } = props;
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-roster-picks">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3} variant="section" id="circuit-roster-picks">
          Picks
        </Title>
        <Text variant="meta">{circuitRosterCountLabel(roster)}</Text>
      </Group>
      <Divider />
      <FormStatus loading={false} result={props.dropStatus} />
      {roster.entries.length === 0 ? (
        <Text className="baseline-textBody">No picks yet.</Text>
      ) : null}
      {circuitRosterByCategory(roster).map(({ category, entries }) => {
        const headingId = `circuit-roster-category-${category.id}`;
        return (
          <Stack
            key={category.id}
            gap="var(--fo-space-0)"
            component="section"
            aria-labelledby={headingId}
          >
            <Group justify="space-between" align="baseline" wrap="wrap" pt="xs">
              <Title order={4} variant="section" id={headingId}>
                {category.name}
              </Title>
              <Text variant="meta">{circuitCategoryCountLabel(category)}</Text>
            </Group>
            {entries.length === 0 ? (
              <Text variant="helper" py="xs">
                None
              </Text>
            ) : (
              <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
                {entries.map((entry, idx) => {
                  const label = circuitSelectionLabel(entry.selection);
                  return (
                    <Box key={entry.ownership_id} component="li">
                      <Group justify="space-between" wrap="nowrap" gap="sm" py="xs">
                        <Text
                          className="baseline-textBody baseline-wrapAnywhere"
                          miw="var(--fo-space-0)"
                          flex={1}
                        >
                          {label}
                        </Text>
                        {canDrop ? (
                          <Button
                            variant="subtle"
                            flex="none"
                            onClick={() => props.onDrop(entry)}
                            loading={droppingSelectionId === entry.selection.id}
                            disabled={droppingSelectionId !== null}
                            aria-label={`Drop ${label}`}
                          >
                            Drop
                          </Button>
                        ) : null}
                      </Group>
                      {idx === entries.length - 1 ? null : <Divider />}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
