import { Box, Text, Tooltip } from "@ui";
import {
  circuitMoveLine,
  circuitMoveOrder,
  type CircuitMoveKind,
  type CircuitMoveLine
} from "@/decisions/circuitMoves";
import type { ContenderPillView } from "@/decisions/contenderPill";
import { ContenderPill } from "@/features/circuitLeagues/ui/ContenderPill";
import { ContenderNomineeCard } from "@/features/circuitLeagues/ui/ContenderCardModal";

/**
 * A log's moves, one line each, stacked: the added line first, then the
 * dropped line. Each line is a muted plus or minus icon (named, with a hover
 * tooltip, never a tab stop) and the caller's pill. `pill` receives the line
 * so the pill can take its state and start its accessible name with the
 * move ("Added: Best Picture: Static").
 */
export function MovesStack(props: {
  moves: Array<{
    key: string;
    kind: CircuitMoveKind;
    pill: (line: CircuitMoveLine) => React.ReactNode;
  }>;
}) {
  if (props.moves.length === 0) return null;
  return (
    <Box className="season-moves">
      {circuitMoveOrder(props.moves).map((move) => {
        const line = circuitMoveLine(move.kind);
        return (
          <Box key={move.key} className="season-move">
            <Tooltip label={line.label} openDelay={400}>
              <Text
                component="span"
                className="gicon season-moveIcon"
                role="img"
                aria-label={line.label}
              >
                {line.glyph}
              </Text>
            </Tooltip>
            {move.pill(line)}
          </Box>
        );
      })}
    </Box>
  );
}

type OpenCard = ((view: ContenderPillView) => void) | undefined;

/** A log move's pill: its state and the start of its name come from the line. */
export function MovePill(props: {
  view: ContenderPillView;
  line: CircuitMoveLine;
  onOpenCard: OpenCard;
}) {
  const { view, line, onOpenCard } = props;
  return (
    <ContenderPill
      label={view.label}
      categoryName={view.categoryName}
      iconCode={view.iconCode}
      iconVariant={view.iconVariant}
      state={line.pillState}
      movePrefix={line.label}
      tooltip={<ContenderNomineeCard tooltip={view.tooltip} />}
      onOpenCard={onOpenCard ? () => onOpenCard(view) : undefined}
    />
  );
}

/** A log row's moves for `MovesStack`: each side that exists, with its pill. */
export function contenderMoves(
  sides: Array<{ kind: CircuitMoveKind; view: ContenderPillView | null }>,
  onOpenCard: OpenCard
) {
  return sides.flatMap(({ kind, view }) =>
    view
      ? [
          {
            key: kind,
            kind,
            pill: (line: CircuitMoveLine) => (
              <MovePill view={view} line={line} onOpenCard={onOpenCard} />
            )
          }
        ]
      : []
  );
}
