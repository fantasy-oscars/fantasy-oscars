import { useMemo, useRef } from "react";
import { Box, Group, SegmentedControl, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives/cards/StandardCard";
import { railMetaCh } from "@/decisions/draft/railMeta";
import type {
  CircuitBoardCategoryCard,
  CircuitBoardPick,
  CircuitBoardRoster
} from "@/decisions/circuitDraft";
import type { ContenderPillView } from "@/decisions/contenderPill";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { useCssVars } from "@/shared/dom/useCssVars";
import { DraftCategoryIcon } from "@/shared/nominee/DraftCategoryIcon";
import { ContenderPill } from "@/features/circuitLeagues/ui/ContenderPill";
import { ContenderNomineeCard } from "@/features/circuitLeagues/ui/ContenderCardModal";
import { SeasonRosterCard } from "@/features/circuitLeagues/ui/SeasonRosterCard";

export type CircuitBoardMode = "player" | "category";

function BoardPill(props: {
  pick: CircuitBoardPick;
  viewOf: (pick: CircuitBoardPick) => ContenderPillView;
  withOwner: boolean;
  onOpenCard?: (pick: CircuitBoardPick) => void;
}) {
  const { pick, onOpenCard } = props;
  const view = props.viewOf(pick);
  return (
    <ContenderPill
      label={view.label}
      categoryName={view.categoryName}
      iconCode={view.iconCode}
      iconVariant={view.iconVariant}
      stateSuffix={props.withOwner ? `drafted by ${pick.username}` : null}
      tooltip={
        <ContenderNomineeCard
          tooltip={view.tooltip}
          drafted={{
            userId: pick.userId,
            username: pick.username,
            avatarKey: pick.avatarKey,
            roundPick: pick.roundPick
          }}
        />
      }
      onOpenCard={onOpenCard ? () => onOpenCard(pick) : undefined}
    />
  );
}

/** A category card: icon and name like the ceremony category card, then ledger rows. */
function CategoryCard(props: {
  card: CircuitBoardCategoryCard;
  viewOf: (pick: CircuitBoardPick) => ContenderPillView;
  onOpenCard?: (pick: CircuitBoardPick) => void;
}) {
  const { card } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const metaCh = railMetaCh(card.picks.map((p) => p.roundPick));
  const vars = useMemo(() => ({ "--dr-meta-ch": metaCh }), [metaCh]);
  useCssVars(listRef, vars);
  const titleId = `circuit-board-category-${card.id}`;
  return (
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
        <Text className="fo-seasonRosterCard-score">{card.picks.length}</Text>
      </Box>
      <Box className="fo-seasonRosterCard-rows" ref={listRef}>
        {card.picks.length === 0 ? (
          <Text className="fo-seasonRosterCard-note">None drafted.</Text>
        ) : (
          card.picks.map((pick) => (
            <Box
              key={pick.originalPickNumber}
              className={["fo-seasonRosterCard-row", "circuit-boardLedgerRow"].join(" ")}
            >
              <Text className="dr-railMeta">{pick.roundPick}</Text>
              <Box className="dr-railAvatar">
                <AnimalAvatarIcon avatarKey={pick.avatarKey} />
              </Box>
              <BoardPill
                pick={pick}
                viewOf={props.viewOf}
                withOwner
                onOpenCard={props.onOpenCard}
              />
            </Box>
          ))
        )}
      </Box>
    </StandardCard>
  );
}

/**
 * The draft board as roster cards (one per seat, in draft order) or category
 * cards of pills. A supplemental pick sits in the slot it filled, with that
 * slot's round-pick, like every other pick; a slot never filled is absent.
 * The board is the draft, not today's rosters, so it shows no points.
 */
export function CircuitDraftBoard(props: {
  mode: CircuitBoardMode;
  onModeChange: (mode: CircuitBoardMode) => void;
  rosters: CircuitBoardRoster[];
  categories: CircuitBoardCategoryCard[];
  viewOf: (pick: CircuitBoardPick) => ContenderPillView;
  /** Phone or coarse pointer: open the nominee card on a tap. */
  onOpenCard?: (pick: CircuitBoardPick) => void;
}) {
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-board-title">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Title order={3} variant="section" id="circuit-board-title">
          Board
        </Title>
        <SegmentedControl
          aria-label="Show the board"
          className="circuit-boardToggle"
          value={props.mode}
          onChange={(v: string) =>
            props.onModeChange(v === "category" ? "category" : "player")
          }
          data={[
            { value: "player", label: "By player" },
            { value: "category", label: "By category" }
          ]}
        />
      </Group>
      <Box className="circuit-board">
        {props.mode === "player"
          ? props.rosters.map((roster) => (
              <Box
                key={roster.seatNumber}
                component="section"
                aria-label={
                  roster.isViewer ? `${roster.username} (you)` : roster.username
                }
                className="circuit-boardCard"
              >
                <SeasonRosterCard
                  title={roster.username}
                  avatarKey={roster.avatarKey}
                  isViewer={roster.isViewer}
                  score={roster.countLabel}
                  scoreLabel={`${roster.countLabel} picks`}
                  rows={roster.picks.map((pick) => ({
                    key: String(pick.originalPickNumber),
                    meta: pick.roundPick,
                    content: (
                      <BoardPill
                        pick={pick}
                        viewOf={props.viewOf}
                        withOwner={false}
                        onOpenCard={props.onOpenCard}
                      />
                    )
                  }))}
                  emptyText="No picks yet."
                />
              </Box>
            ))
          : props.categories.map((card) => (
              <CategoryCard
                key={card.id}
                card={card}
                viewOf={props.viewOf}
                onOpenCard={props.onOpenCard}
              />
            ))}
      </Box>
    </Stack>
  );
}
