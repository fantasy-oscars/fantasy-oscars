import { ActionIcon, Box, Divider, Group, Stack, Text, Title, Tooltip } from "@ui";
import { FormStatus } from "@/shared/forms";
import { DraftCategoryIcon } from "@/shared/nominee/DraftCategoryIcon";
import {
  circuitCategoryCountLabel,
  circuitRosterByCategory,
  type CircuitRosterEntry
} from "@/decisions/circuitRoster";
import {
  circuitDroppedPointsNote,
  circuitRosterPicks,
  circuitRosterPointsMeta,
  type CircuitRosterPick
} from "@/decisions/circuitPoints";
import type { ApiResult, CircuitLeagueCategory, CircuitRoster } from "@/lib/types";
import { ContenderPill } from "@/features/circuitLeagues/ui/ContenderPill";
import { ContenderNomineeCard } from "@/features/circuitLeagues/ui/ContenderCardModal";

/**
 * A roster grouped by category under compact headings: one line per pick,
 * the pill with its points (gold once it has won for this player, the
 * breakdown in its nominee card) and, on the viewer's own roster, a drop
 * icon. On a phone or a coarse pointer a tap on the pill opens the card.
 */
export function CircuitRosterList(props: {
  roster: CircuitRoster;
  categories: readonly CircuitLeagueCategory[];
  canDrop: boolean;
  droppingSelectionId: number | null;
  dropStatus: ApiResult | null;
  onDrop: (entry: CircuitRosterEntry) => void;
  /** Phone or coarse pointer: open the nominee card on a tap. */
  onOpenCard?: (pick: CircuitRosterPick) => void;
}) {
  const { roster, canDrop, droppingSelectionId } = props;
  const picks = circuitRosterPicks(roster, props.categories);
  const droppedNote = circuitDroppedPointsNote(roster.dropped_points, "earlier");
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-roster-picks">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3} variant="section" id="circuit-roster-picks">
          Picks
        </Title>
        <Text variant="meta">{circuitRosterPointsMeta(roster)}</Text>
      </Group>
      <Divider />
      <FormStatus loading={false} result={props.dropStatus} />
      {roster.entries.length === 0 ? (
        <Text className="baseline-textBody">No picks yet.</Text>
      ) : null}
      <Stack gap="xs" className={["fo-pillScope", "circuit-rosterGroups"].join(" ")}>
        {circuitRosterByCategory(roster).map(({ category, entries }) => {
          const headingId = `circuit-roster-category-${category.id}`;
          const leagueCategory = props.categories.find((c) => c.id === category.id);
          return (
            <Box key={category.id} component="section" aria-labelledby={headingId}>
              <Box className="circuit-rosterGroupHead">
                <DraftCategoryIcon
                  icon={leagueCategory?.icon_code ?? ""}
                  variant={
                    leagueCategory?.icon_variant === "inverted" ? "inverted" : "default"
                  }
                  className="circuit-rosterGroupIcon"
                />
                <Box component="h4" id={headingId} className="circuit-rosterGroupName">
                  {category.name}
                </Box>
                <Text component="span" variant="meta">
                  {circuitCategoryCountLabel(category)}
                </Text>
              </Box>
              {entries.length === 0 ? (
                <Text variant="helper" className="circuit-rosterNone">
                  None
                </Text>
              ) : (
                <Box
                  component="ul"
                  className={["fo-listReset", "circuit-rosterRows"].join(" ")}
                >
                  {entries.map((entry) => {
                    const pick = picks.get(entry.ownership_id);
                    if (!pick) return null;
                    const onOpenCard = props.onOpenCard;
                    return (
                      <Box
                        key={entry.ownership_id}
                        component="li"
                        className="circuit-rosterRow"
                      >
                        <ContenderPill
                          label={pick.view.label}
                          categoryName={pick.view.categoryName}
                          iconCode={pick.view.iconCode}
                          iconVariant={pick.view.iconVariant}
                          points={pick.pill.points}
                          pointsLabel={pick.pill.pointsLabel}
                          winner={pick.pill.winner}
                          tooltip={
                            <ContenderNomineeCard
                              tooltip={pick.view.tooltip}
                              pointsSection={pick.pill.pointsSection}
                            />
                          }
                          onOpenCard={onOpenCard ? () => onOpenCard(pick) : undefined}
                        />
                        {canDrop ? (
                          <Tooltip label="Drop">
                            <ActionIcon
                              type="button"
                              className="circuit-rowIcon"
                              onClick={() => props.onDrop(entry)}
                              loading={droppingSelectionId === entry.selection.id}
                              disabled={droppingSelectionId !== null}
                              aria-label={`Drop ${pick.view.label}`}
                            >
                              <Text component="span" className="gicon" aria-hidden="true">
                                remove_circle
                              </Text>
                            </ActionIcon>
                          </Tooltip>
                        ) : null}
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>
      {droppedNote ? (
        <Text variant="helper" className="circuit-rosterDroppedNote">
          {droppedNote}
        </Text>
      ) : null}
    </Stack>
  );
}
