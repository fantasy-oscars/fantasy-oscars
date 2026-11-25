import { Box, Text } from "@ui";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { CircuitTransactionRow } from "@/decisions/circuitTransactions";
import { PlayerName } from "@/shared/PlayerName";
import { MovesStack, contenderMoves } from "@/features/circuitLeagues/ui/MovesStack";

/**
 * The league's transactions, newest first, one row each: who, the moves
 * stacked (a plus line for what came in, then a minus line with a dashed
 * pill for what went out) and the kind and time. On a phone the name and
 * the kind and time share the first line, with the moves below.
 */
export function CircuitTransactionList(props: {
  rows: CircuitTransactionRow[];
  /** Phone or coarse pointer: open the nominee card on a tap. */
  onOpenCard?: (view: ContenderPillView) => void;
}) {
  const { rows } = props;
  if (rows.length === 0) {
    return <Text className="baseline-textBody">No transactions yet.</Text>;
  }
  return (
    <Box
      component="ol"
      className={["season-list", "fo-listReset", "fo-pillScope", "circuit-txList"].join(
        " "
      )}
      aria-label="Transactions"
    >
      {rows.map((row) => (
        <Box
          key={row.key}
          component="li"
          className={["season-row", "circuit-txRow"].join(" ")}
        >
          <Box className="circuit-txWho">
            <PlayerName name={row.username} avatarKey={row.avatarKey} density="dense" />
          </Box>
          <Box className="circuit-txMoves">
            <MovesStack
              moves={contenderMoves(
                [
                  { kind: "added", view: row.add },
                  { kind: "dropped", view: row.drop }
                ],
                props.onOpenCard
              )}
            />
          </Box>
          <Text component="span" variant="meta" className="circuit-txWhen">
            {row.kindLabel} ·{" "}
            <time dateTime={row.occurredAt} title={row.timeTitle}>
              {row.timeLabel}
            </time>
          </Text>
        </Box>
      ))}
    </Box>
  );
}
