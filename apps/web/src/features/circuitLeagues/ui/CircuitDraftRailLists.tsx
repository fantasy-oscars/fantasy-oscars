import { useMemo, useRef } from "react";
import { Box, Text, VisuallyHidden } from "@ui";
import { railMetaCh } from "@/decisions/draft/railMeta";
import type { CircuitDraftedBy, CircuitHistoryRow } from "@/decisions/circuitDraftRoom";
import type { ContenderPillView } from "@/decisions/contenderPill";
import { useCssVars } from "@/shared/dom/useCssVars";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";
import { ContenderPill } from "@/features/circuitLeagues/ui/ContenderPill";
import { ContenderNomineeCard } from "@/features/circuitLeagues/ui/ContenderCardModal";

/** A drafted slot's contender pill and what its nominee card needs. */
export type CircuitRailPick = { view: ContenderPillView; drafted: CircuitDraftedBy };

/** A slot with no contender ("—" still to come, or "Missed"), as the ceremony rail draws it. */
function OpenSlotPill(props: { row: CircuitHistoryRow; owner: string }) {
  const { row } = props;
  return (
    <Box className="dr-pill dr-pill-static is-muted" title={row.label}>
      <Text component="span" className="dr-pill-text" lineClamp={1}>
        <VisuallyHidden>{`${props.owner}: `}</VisuallyHidden>
        {row.label}
        {row.active ? <VisuallyHidden> (on the clock)</VisuallyHidden> : null}
      </Text>
    </Box>
  );
}

/** A drafted contender: the pill with its category icon and the nominee card with the drafted chip. */
function PickPill(props: {
  pick: CircuitRailPick;
  stateSuffix: string | null;
  onOpenCard?: () => void;
}) {
  const { view, drafted } = props.pick;
  return (
    <ContenderPill
      label={view.label}
      categoryName={view.categoryName}
      iconCode={view.iconCode}
      iconVariant={view.iconVariant}
      stateSuffix={props.stateSuffix}
      tooltip={<ContenderNomineeCard tooltip={view.tooltip} drafted={drafted} />}
      onOpenCard={props.onOpenCard}
    />
  );
}

function useMetaWidth(rows: CircuitHistoryRow[]) {
  const listRef = useRef<HTMLOListElement>(null);
  const vars = useMemo(
    () => ({ "--dr-meta-ch": railMetaCh(rows.map((r) => r.roundPick)) }),
    [rows]
  );
  useCssVars(listRef, vars);
  return listRef;
}

/**
 * Every slot in pick order: the ledger row (round-pick, avatar, pill). A
 * drafted slot's pill carries the category icon and the nominee card; on a
 * phone a tap opens the card instead.
 */
export function CircuitHistoryList(props: {
  rows: CircuitHistoryRow[];
  avatarKeyBySeat: Map<number, string | null>;
  pickOf: (row: CircuitHistoryRow) => CircuitRailPick | null;
  /** Phone or coarse pointer: open the nominee card on a tap. */
  onOpenCard?: (pick: CircuitRailPick) => void;
}) {
  const listRef = useMetaWidth(props.rows);
  return (
    <Box
      className="dr-railList fo-listReset"
      ref={listRef}
      component="ol"
      aria-label="Picks"
    >
      {props.rows.map((r) => {
        const pick = props.pickOf(r);
        const onOpenCard = props.onOpenCard;
        return (
          <Box
            key={r.pickNumber}
            component="li"
            className="dr-railRow dr-ledgerRow"
            data-active={r.active ? "true" : "false"}
          >
            <Text className="dr-railMeta">{r.roundPick}</Text>
            <Box className="dr-railAvatar">
              <AnimalAvatarIcon
                avatarKey={
                  r.seatNumber === null
                    ? null
                    : (props.avatarKeyBySeat.get(r.seatNumber) ?? null)
                }
              />
            </Box>
            {pick ? (
              <PickPill
                pick={pick}
                stateSuffix={`drafted by ${r.username}${r.auto ? " from queue" : ""}`}
                onOpenCard={onOpenCard ? () => onOpenCard(pick) : undefined}
              />
            ) : (
              <OpenSlotPill row={r} owner={r.username} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** The viewer's drafted contenders: the roster row (round-pick, pill). */
export function CircuitRosterList(props: {
  rows: CircuitHistoryRow[];
  pickOf: (row: CircuitHistoryRow) => CircuitRailPick | null;
  onOpenCard?: (pick: CircuitRailPick) => void;
}) {
  const listRef = useMetaWidth(props.rows);
  if (props.rows.length === 0) {
    return <Text className="dr-railEmpty">No picks yet</Text>;
  }
  return (
    <Box
      className="dr-railList fo-listReset"
      ref={listRef}
      component="ol"
      aria-label="Your picks"
    >
      {props.rows.map((r) => {
        const pick = props.pickOf(r);
        const onOpenCard = props.onOpenCard;
        return (
          <Box key={r.pickNumber} component="li" className="dr-railRow dr-rosterRow">
            <Text className="dr-railMeta">{r.roundPick}</Text>
            {pick ? (
              <PickPill
                pick={pick}
                stateSuffix={null}
                onOpenCard={onOpenCard ? () => onOpenCard(pick) : undefined}
              />
            ) : (
              <OpenSlotPill row={r} owner={r.username} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
