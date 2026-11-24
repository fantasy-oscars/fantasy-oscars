import { Box, Text } from "@ui";
import type {
  CircuitCategoryPointsEntry,
  CircuitCategoryPointsRow,
  CircuitPlayerPointsCard
} from "@/decisions/circuitPoints";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { CircuitSelectionSummary } from "@/lib/types";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
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

function CategoryEntries(props: {
  entries: CircuitCategoryPointsEntry[];
  winner: boolean;
  viewOf: ViewOf;
  onOpenCard?: CircuitPointsCardOpener;
}) {
  const { entries, onOpenCard } = props;
  if (entries.length === 0) {
    return (
      <Text component="span" className="dr-pill-caption" aria-label="None">
        —
      </Text>
    );
  }
  return (
    <Box component="ul" className={["fo-listReset", "circuit-pointsEntries"].join(" ")}>
      {entries.map((entry) => {
        const view = props.viewOf(entry.selection);
        return (
          <Box key={entry.key} component="li" className="circuit-pointsEntry">
            <ContenderPill
              label={view.label}
              categoryName={view.categoryName}
              iconCode={view.iconCode}
              iconVariant={view.iconVariant}
              points={entry.points}
              pointsLabel={entry.pointsLabel}
              winner={props.winner}
              state={entry.dropped ? "dropped" : "default"}
              stateSuffix={entry.dropped ? `${entry.username}, dropped` : entry.username}
              tooltip={<ContenderNomineeCard tooltip={view.tooltip} />}
              onOpenCard={
                onOpenCard
                  ? () => onOpenCard({ tooltip: view.tooltip, actions: [] })
                  : undefined
              }
            />
            <Box component="span" className="circuit-pointsPlayer" aria-hidden="true">
              <AnimalAvatarIcon avatarKey={entry.avatarKey} size="sm" />
              <Text
                component="span"
                className="circuit-pointsPlayerName"
                title={entry.username}
              >
                {entry.dropped ? `${entry.username} · dropped` : entry.username}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Points by category: every season category in order, with the
 * nominations and the wins scored in it here. Each entry is the pill (gold
 * in Wins) and the player it scored for; an empty cell reads "—".
 */
export function CircuitCeremonyPointsByCategory(props: {
  rows: CircuitCategoryPointsRow[];
  viewOf: ViewOf;
  onOpenCard?: CircuitPointsCardOpener;
}) {
  return (
    <Box className={["fo-pillScope", "circuit-pointsTable"].join(" ")}>
      <Box className="circuit-pointsHead" aria-hidden="true">
        <span />
        <Text component="span" className="circuit-pointsLabel">
          Nominations
        </Text>
        <Text component="span" className="circuit-pointsLabel">
          Wins
        </Text>
      </Box>
      <Box component="ul" className="fo-listReset" aria-label="Points by category">
        {props.rows.map((row) => {
          const titleId = `circuit-points-category-${row.id}`;
          return (
            <Box
              key={row.id}
              component="li"
              className="circuit-pointsRow"
              aria-labelledby={titleId}
            >
              <Box className="circuit-pointsCategory">
                <DraftCategoryIcon
                  icon={row.iconCode ?? ""}
                  variant={row.iconVariant === "inverted" ? "inverted" : "default"}
                />
                <Text
                  component="span"
                  id={titleId}
                  className="circuit-pointsCategoryName"
                >
                  {row.name}
                </Text>
              </Box>
              <Box className="circuit-pointsCell" role="group" aria-label="Nominations">
                <Text
                  component="span"
                  className={["circuit-pointsLabel", "circuit-pointsCellLabel"].join(" ")}
                >
                  Nominations
                </Text>
                <CategoryEntries
                  entries={row.nominations}
                  winner={false}
                  viewOf={props.viewOf}
                  onOpenCard={props.onOpenCard}
                />
              </Box>
              <Box className="circuit-pointsCell" role="group" aria-label="Wins">
                <Text
                  component="span"
                  className={["circuit-pointsLabel", "circuit-pointsCellLabel"].join(" ")}
                >
                  Wins
                </Text>
                <CategoryEntries
                  entries={row.wins}
                  winner
                  viewOf={props.viewOf}
                  onOpenCard={props.onOpenCard}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
