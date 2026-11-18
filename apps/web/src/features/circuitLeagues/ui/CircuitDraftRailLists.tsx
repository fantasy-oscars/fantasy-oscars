import { useMemo, useRef } from "react";
import { Box, Text, VisuallyHidden } from "@ui";
import { railMetaCh } from "@/decisions/draft/railMeta";
import type { CircuitHistoryRow } from "@/decisions/circuitDraftRoom";
import { useCssVars } from "@/shared/dom/useCssVars";
import { AnimalAvatarIcon } from "@/shared/animalAvatarIcon";

/** A rail row's pill, as the ceremony rails draw it, with the category under it. */
function RailPill(props: {
  row: CircuitHistoryRow;
  withCategory: boolean;
  /** Read before the pick: who holds the slot. */
  owner?: string;
}) {
  const { row } = props;
  const muted = !row.picked;
  const name = row.auto ? `${row.label} (from queue)` : row.label;
  return (
    <Box className="circuit-railPick">
      <Box
        className={["dr-pill", "dr-pill-static", muted ? "is-muted" : ""]
          .filter(Boolean)
          .join(" ")}
        title={row.categoryName ? `${row.categoryName}: ${name}` : name}
      >
        <Text component="span" className="dr-pill-text" lineClamp={1}>
          {props.owner ? <VisuallyHidden>{`${props.owner}: `}</VisuallyHidden> : null}
          {row.label}
          {row.auto ? <VisuallyHidden> (from queue)</VisuallyHidden> : null}
          {row.active ? <VisuallyHidden> (on the clock)</VisuallyHidden> : null}
        </Text>
      </Box>
      {props.withCategory && row.categoryName ? (
        <Text component="span" className="circuit-railSub">
          {row.categoryName}
        </Text>
      ) : null}
    </Box>
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

/** Every slot in pick order: who holds it and what they drafted. */
export function CircuitHistoryList(props: {
  rows: CircuitHistoryRow[];
  avatarKeyBySeat: Map<number, string | null>;
}) {
  const listRef = useMetaWidth(props.rows);
  return (
    <Box
      className="dr-railList fo-listReset"
      ref={listRef}
      component="ol"
      aria-label="Picks"
    >
      {props.rows.map((r) => (
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
          <RailPill row={r} withCategory={false} owner={r.username} />
        </Box>
      ))}
    </Box>
  );
}

/** The viewer's drafted contenders, in pick order. */
export function CircuitRosterList(props: { rows: CircuitHistoryRow[] }) {
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
      {props.rows.map((r) => (
        <Box key={r.pickNumber} component="li" className="dr-railRow dr-rosterRow">
          <Text className="dr-railMeta">{r.roundPick}</Text>
          <RailPill row={r} withCategory />
        </Box>
      ))}
    </Box>
  );
}
