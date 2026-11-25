import { ActionIcon, Box, Divider, Group, Stack, Text, Title, Tooltip } from "@ui";
import { FormStatus } from "@/shared/forms";
import { DraftCategoryIcon } from "@/shared/nominee/DraftCategoryIcon";
import {
  circuitRosterFlatEntries,
  circuitRosterLimitItems,
  type CircuitRosterEntry,
  type CircuitRosterLimitItem
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

/** "[icon] 3 of 3" per limited category; a full category's count is semibold. */
function RosterLimits(props: { items: CircuitRosterLimitItem[] }) {
  return (
    <Box
      component="ul"
      className={["fo-listReset", "circuit-rosterLimits"].join(" ")}
      aria-label="Category limits"
    >
      {props.items.map((item) => (
        <Box key={item.categoryId} component="li" className="circuit-rosterLimit">
          <Tooltip label={item.name}>
            <Box component="span" role="img" aria-label={item.name}>
              <DraftCategoryIcon icon={item.iconCode} variant={item.iconVariant} />
            </Box>
          </Tooltip>
          <Text
            component="span"
            variant="meta"
            fw={item.full ? "var(--fo-font-weight-semibold)" : undefined}
          >
            {item.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

/**
 * A roster as one flat list in category order: one line per pick, the pill
 * with its points (gold once it has won for this player, the breakdown in
 * its nominee card) and, on the viewer's own roster, a drop icon. The pill's
 * icon names the category; a limits line follows when the season sets
 * per-category limits. On a phone or a coarse pointer a tap on the pill
 * opens the card.
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
  const entries = circuitRosterFlatEntries(roster);
  const limits = circuitRosterLimitItems(roster, props.categories);
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
      {entries.length === 0 ? (
        <Text className="baseline-textBody">No picks yet.</Text>
      ) : (
        <Box
          component="ul"
          className={["fo-listReset", "fo-pillScope", "circuit-rosterRows"].join(" ")}
          aria-label="Picks"
        >
          {entries.map((entry) => {
            const pick = picks.get(entry.ownership_id);
            if (!pick) return null;
            const onOpenCard = props.onOpenCard;
            return (
              <Box
                key={entry.ownership_id}
                component="li"
                className={[
                  "season-row",
                  "circuit-rosterRow",
                  canDrop ? "has-action" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
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
      {limits.length > 0 ? <RosterLimits items={limits} /> : null}
      {droppedNote ? (
        <Text variant="helper" className="circuit-rosterDroppedNote">
          {droppedNote}
        </Text>
      ) : null}
    </Stack>
  );
}
