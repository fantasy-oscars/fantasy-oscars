import { Box, Text } from "@ui";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { CircuitTransactionRow } from "@/decisions/circuitTransactions";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { ContenderPill } from "@/features/circuitLeagues/ui/ContenderPill";
import { ContenderNomineeCard } from "@/features/circuitLeagues/ui/ContenderCardModal";

function Move(props: {
  verb: "Added" | "Dropped";
  view: ContenderPillView;
  onOpenCard?: (view: ContenderPillView) => void;
}) {
  const { view, onOpenCard } = props;
  const dropped = props.verb === "Dropped";
  return (
    <Box component="span" className="circuit-txMove">
      <Text component="span" className="dr-pill-caption">
        {props.verb}
      </Text>
      <ContenderPill
        label={view.label}
        categoryName={view.categoryName}
        iconCode={view.iconCode}
        iconVariant={view.iconVariant}
        state={dropped ? "dropped" : "default"}
        stateSuffix={dropped ? "dropped" : null}
        tooltip={<ContenderNomineeCard tooltip={view.tooltip} />}
        onOpenCard={onOpenCard ? () => onOpenCard(view) : undefined}
      />
    </Box>
  );
}

/**
 * The league's transactions, newest first, one row each: who, the moves as
 * pills ("Added", then "Dropped" with a dashed pill) and the kind and time.
 * On a phone the name and the kind and time share the first line.
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
      className={["fo-listReset", "fo-pillScope", "circuit-txList"].join(" ")}
      aria-label="Transactions"
    >
      {rows.map((row) => (
        <Box key={row.key} component="li" className="circuit-txRow">
          <Box className="circuit-txWho">
            <AnimalAvatarIcon avatarKey={row.avatarKey} size="sm" />
            <Text component="span" className="circuit-txName" title={row.username}>
              {row.username}
            </Text>
          </Box>
          <Box className="circuit-txMoves">
            {row.add ? (
              <Move verb="Added" view={row.add} onOpenCard={props.onOpenCard} />
            ) : null}
            {row.drop ? (
              <Move verb="Dropped" view={row.drop} onOpenCard={props.onOpenCard} />
            ) : null}
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
