import { Box, Text } from "@ui";
import type {
  CircuitCategoryPointsCard,
  CircuitCategoryPointsEntry,
  CircuitPlayerPointsCard
} from "@/decisions/circuitPoints";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { CircuitSelectionSummary } from "@/lib/types";
import { StandardCard } from "@/primitives/cards/StandardCard";
import { PlayerName } from "@/shared/PlayerName";
import { DraftCategoryIcon } from "@/shared/nominee/DraftCategoryIcon";
import { ContenderPill } from "./ContenderPill";
import { ContenderNomineeCard } from "./ContenderCardModal";
import { CircuitPointsPill, type CircuitPointsCardOpener } from "./CircuitPointsPill";
import { SeasonRosterCard } from "./SeasonRosterCard";

export type CircuitPointsMode = "player" | "category";

type ViewOf = (selection: CircuitSelectionSummary) => ContenderPillView;

/**
 * Points by player: every member's roster card in rank order, with the
 * ceremony total and one pill per pick that scored here. A pick dropped
 * since is dashed with "Dropped" and still counts, so the pills add up to
 * the card's total. Final rosters draws its cards the same way, with the
 * dropped-picks remainder under the pills.
 */
export function CircuitCeremonyPointsByPlayer(props: {
  cards: CircuitPlayerPointsCard[];
  viewerUserId: number | null;
  viewOf: ViewOf;
  onOpenCard?: CircuitPointsCardOpener;
  /** The list's name; Final rosters reuses these cards. */
  label?: string;
  emptyText?: string;
}) {
  return (
    <Box
      component="ol"
      className={["fo-listReset", "circuit-board"].join(" ")}
      aria-label={props.label ?? "Points by player"}
    >
      {props.cards.map((card) => (
        <Box key={card.userId} component="li" className="circuit-boardCard">
          <SeasonRosterCard
            title={card.title}
            avatarKey={card.avatarKey}
            isViewer={card.userId === props.viewerUserId}
            score={card.totalLabel}
            scoreLabel={`${card.totalLabel} points`}
            summary={card.summary}
            rows={card.pills.map((pill) => ({
              key: pill.key,
              content: (
                <CircuitPointsPill
                  pill={pill}
                  view={props.viewOf(pill.selection)}
                  onOpenCard={props.onOpenCard}
                />
              )
            }))}
            emptyText={props.emptyText ?? "No points at this ceremony."}
            remainder={card.remainder}
          />
        </Box>
      ))}
    </Box>
  );
}

/** A card's entry: the pill (gold if it won here) and the player it scored for. */
function CategoryEntry(props: {
  entry: CircuitCategoryPointsEntry;
  viewOf: ViewOf;
  onOpenCard?: CircuitPointsCardOpener;
}) {
  const { entry, onOpenCard } = props;
  const view = props.viewOf(entry.selection);
  return (
    <Box
      component="li"
      className={["fo-seasonRosterCard-row", "circuit-pointsEntry"].join(" ")}
    >
      <ContenderPill
        label={view.label}
        categoryName={view.categoryName}
        iconCode={view.iconCode}
        iconVariant={view.iconVariant}
        points={entry.points}
        pointsLabel={entry.pointsLabel}
        winner={entry.won}
        state={entry.dropped ? "dropped" : "default"}
        stateSuffix={entry.dropped ? `${entry.username}, dropped` : entry.username}
        tooltip={
          <ContenderNomineeCard
            tooltip={view.tooltip}
            pointsSection={entry.pointsSection}
          />
        }
        onOpenCard={
          onOpenCard
            ? () =>
                onOpenCard({
                  tooltip: view.tooltip,
                  pointsSection: entry.pointsSection,
                  actions: []
                })
            : undefined
        }
      />
      {/* The pill's name already says who; this is the visible cue. */}
      <Box component="span" className="circuit-pointsPlayer" aria-hidden="true">
        <PlayerName name={entry.username} avatarKey={entry.avatarKey} density="dense" />
        {entry.dropped ? (
          <Text component="span" variant="meta" className="circuit-pointsDropped">
            · dropped
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * Points by category, laid out like the draft board's category cards: every
 * season category in order, with the points awarded in it here and one pill
 * per contender and player, winners first and gold. A category without
 * points keeps its card.
 */
export function CircuitCeremonyPointsByCategory(props: {
  cards: CircuitCategoryPointsCard[];
  viewOf: ViewOf;
  onOpenCard?: CircuitPointsCardOpener;
}) {
  return (
    <Box
      component="ul"
      className={["fo-listReset", "circuit-board", "circuit-pointsBoard"].join(" ")}
      aria-label="Points by category"
    >
      {props.cards.map((card) => {
        const titleId = `circuit-points-category-${card.id}`;
        return (
          <Box key={card.id} component="li" className="circuit-boardCard">
            <StandardCard
              component="section"
              aria-labelledby={titleId}
              className="fo-pillScope fo-seasonRosterCard"
            >
              <Box className="fo-seasonRosterCard-head">
                <DraftCategoryIcon
                  icon={card.iconCode ?? ""}
                  variant={card.iconVariant === "inverted" ? "inverted" : "default"}
                />
                <Text className="fo-seasonRosterCard-name" id={titleId} title={card.name}>
                  {card.name}
                </Text>
                <Text className="fo-seasonRosterCard-score">{card.pointsLabel}</Text>
              </Box>
              {card.entries.length === 0 ? (
                <Text className="fo-seasonRosterCard-note">
                  No points in this category.
                </Text>
              ) : (
                <Box
                  component="ul"
                  className={["fo-listReset", "fo-seasonRosterCard-rows"].join(" ")}
                >
                  {card.entries.map((entry) => (
                    <CategoryEntry
                      key={entry.key}
                      entry={entry}
                      viewOf={props.viewOf}
                      onOpenCard={props.onOpenCard}
                    />
                  ))}
                </Box>
              )}
            </StandardCard>
          </Box>
        );
      })}
    </Box>
  );
}
