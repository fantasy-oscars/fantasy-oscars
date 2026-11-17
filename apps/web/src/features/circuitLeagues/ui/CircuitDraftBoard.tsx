import { Box, Divider, Group, SegmentedControl, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import type {
  CircuitBoardCategory,
  CircuitBoardCell,
  CircuitBoardSeat
} from "@/decisions/circuitDraft";

export type CircuitBoardMode = "player" | "category";

function cellMeta(cell: CircuitBoardCell, show: "category" | "player"): string {
  const parts = [cell.slotLabel];
  if (show === "category" && cell.categoryName) parts.push(cell.categoryName);
  if (show === "player") parts.push(cell.username);
  if (cell.auto) parts.push("From queue");
  return parts.join(" · ");
}

function Cell(props: { cell: CircuitBoardCell; show: "category" | "player" }) {
  const { cell } = props;
  return (
    <Box
      component="li"
      className={`circuit-boardCell${cell.missed ? " is-missed" : ""}${
        cell.supplemental ? " is-supplemental" : ""
      }`}
    >
      <Text
        className="baseline-textBody baseline-wrapAnywhere"
        fw="var(--fo-font-weight-bold)"
      >
        {cell.label}
      </Text>
      <Text variant="helper" className="baseline-textBody baseline-wrapAnywhere">
        {cellMeta(cell, props.show)}
      </Text>
      {cell.note ? (
        <Text variant="helper" className="baseline-textBody baseline-wrapAnywhere">
          {cell.note}
        </Text>
      ) : null}
    </Box>
  );
}

function Column(props: {
  id: string;
  title: string;
  meta: string;
  highlight: string | null;
  cells: CircuitBoardCell[];
  show: "category" | "player";
  empty: string;
}) {
  return (
    <StandardCard
      component="section"
      aria-labelledby={props.id}
      className="circuit-boardColumn"
    >
      <Stack gap="xs">
        <Group justify="space-between" align="baseline" wrap="wrap" gap="xs">
          <Title
            order={4}
            variant="section"
            id={props.id}
            className="baseline-wrapAnywhere"
          >
            {props.title}
          </Title>
          <Text variant="meta">{props.meta}</Text>
        </Group>
        {props.highlight ? (
          <Text variant="helper" className="circuit-boardHighlight">
            {props.highlight}
          </Text>
        ) : null}
        <Divider />
        {props.cells.length === 0 ? (
          <Text variant="helper">{props.empty}</Text>
        ) : (
          <Stack component="ol" gap="var(--fo-space-0)" className="fo-listReset">
            {props.cells.map((cell) => (
              <Cell key={cell.pickNumber} cell={cell} show={props.show} />
            ))}
          </Stack>
        )}
      </Stack>
    </StandardCard>
  );
}

/**
 * The draft board as of the snapshot, by player (seats in draft order) or by
 * category. Missed and supplemental picks are labelled as such.
 */
export function CircuitDraftBoard(props: {
  mode: CircuitBoardMode;
  onModeChange: (mode: CircuitBoardMode) => void;
  seats: CircuitBoardSeat[];
  categories: CircuitBoardCategory[];
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
          ? props.seats.map((seat) => (
              <Column
                key={seat.seatNumber}
                id={`circuit-board-seat-${seat.seatNumber}`}
                title={seat.isViewer ? `${seat.username} (you)` : seat.username}
                meta={seat.countLabel}
                highlight={seat.onTheClock ? "On the clock" : null}
                cells={seat.cells}
                show="category"
                empty="No picks yet."
              />
            ))
          : props.categories.map((category) => (
              <Column
                key={category.id}
                id={`circuit-board-category-${category.id}`}
                title={category.name}
                meta={String(category.cells.length)}
                highlight={null}
                cells={category.cells}
                show="player"
                empty="None drafted yet."
              />
            ))}
      </Box>
    </Stack>
  );
}
