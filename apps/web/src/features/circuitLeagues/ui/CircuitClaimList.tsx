import { useEffect, useRef, useState } from "react";
import type { PointerEvent, TouchEvent } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ActionIcon, Box, Menu, Text, Tooltip, VisuallyHidden } from "@ui";
import { useRowReorderSensors } from "@/shared/dnd/useRowReorderSensors";
import {
  ROW_DRAG_ACCESSIBILITY,
  useDragClickGuard,
  useRowSortable
} from "@/shared/dnd/useRowSortable";
import { moveInOrder } from "@/decisions/admin/circuit";
import { circuitQueueMoved } from "@/decisions/circuitDraft";
import {
  circuitClaimMenu,
  circuitClaimMovedNote,
  type CircuitClaimMenuKey,
  type CircuitClaimRow
} from "@/decisions/circuitWaivers";
import type { CircuitMoveLine } from "@/decisions/circuitMoves";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { CircuitClaim } from "@/lib/types";
import { ContenderPill } from "@/features/circuitLeagues/ui/ContenderPill";
import { ContenderNomineeCard } from "@/features/circuitLeagues/ui/ContenderCardModal";
import { MovesStack } from "@/features/circuitLeagues/ui/MovesStack";

const dragId = (id: number) => `claim:${id}`;
const idOf = (raw: unknown) => Number(String(raw ?? "").split(":")[1]);
const CLAIM_PILL = "circuit-claimPill";

/**
 * A drag starts on any part of the row that is not a control, or on the
 * claim pill (a click on it below the drag distance still edits).
 */
function startsDrag(target: EventTarget) {
  const control = (target as Element).closest(
    "button, a, input, [role='button'], [role='menuitem']"
  );
  return !control || control.classList.contains(CLAIM_PILL);
}

/**
 * The claim and its drop as stacked moves (the claim's plus line, then the
 * minus line of the drop if the claim wins), shared by the row and its
 * lifted copy. A claim without a drop has one line.
 */
function ClaimPills(props: {
  row: CircuitClaimRow;
  phone: boolean;
  disabled: boolean;
  lifted: boolean;
  onEdit?: () => void;
  onMoveKey?: (e: React.KeyboardEvent) => void;
  onOpenCard?: (view: ContenderPillView) => void;
}) {
  const { pill, drop } = props.row;
  const live = !props.lifted;
  const claimLine = {
    key: "claim",
    kind: "claim" as const,
    pill: (line: CircuitMoveLine) => (
      <ContenderPill
        label={pill.label}
        categoryName={pill.categoryName}
        iconCode={pill.iconCode}
        iconVariant={pill.iconVariant}
        state={line.pillState}
        movePrefix={line.label}
        className={live ? CLAIM_PILL : undefined}
        tooltip={
          live && !props.phone ? (
            <ContenderNomineeCard tooltip={pill.tooltip} />
          ) : undefined
        }
        onActivate={live && !props.disabled ? props.onEdit : undefined}
        onKeyDown={live && !props.disabled ? props.onMoveKey : undefined}
        keyShortcuts={live && !props.disabled ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
      />
    )
  };
  const dropLine = drop
    ? [
        {
          key: "drop",
          kind: "claimDrop" as const,
          pill: (line: CircuitMoveLine) => (
            <ContenderPill
              label={drop.label}
              categoryName={drop.categoryName}
              iconCode={drop.iconCode}
              iconVariant={drop.iconVariant}
              state={line.pillState}
              movePrefix={line.label}
              tooltip={live ? <ContenderNomineeCard tooltip={drop.tooltip} /> : undefined}
              onOpenCard={
                live && props.onOpenCard ? () => props.onOpenCard?.(drop) : undefined
              }
            />
          )
        }
      ]
    : [];
  return (
    <Box className="circuit-claimMain">
      <MovesStack moves={[claimLine, ...dropLine]} />
    </Box>
  );
}

/** A row's icon action: 32 px (44 px on a phone), with a visible tooltip. */
function ClaimIcon(props: {
  icon: string;
  tooltip: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={props.tooltip}>
      <ActionIcon
        type="button"
        variant="subtle"
        className="circuit-rowIcon"
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        <Text component="span" className="gicon" aria-hidden="true">
          {props.icon}
        </Text>
      </ActionIcon>
    </Tooltip>
  );
}

/** The phone row's one menu: Move up, Move down, Edit claim, Withdraw. */
function ClaimMenu(props: {
  label: string;
  items: ReturnType<typeof circuitClaimMenu>;
  onSelect: (key: CircuitClaimMenuKey) => void;
}) {
  return (
    <Menu withinPortal position="bottom-end" shadow="md">
      <Tooltip label="More actions">
        <Menu.Target>
          <ActionIcon
            type="button"
            variant="subtle"
            className="circuit-rowIcon"
            aria-label={`More actions for your claim for ${props.label}`}
            // Locked or busy: every item is disabled, so the trigger is too.
            disabled={props.items.every((item) => item.disabled)}
          >
            <Text component="span" className="gicon" aria-hidden="true">
              more_horiz
            </Text>
          </ActionIcon>
        </Menu.Target>
      </Tooltip>
      <Menu.Dropdown>
        {props.items.map((item) => (
          <Menu.Item
            key={item.key}
            onClick={() => props.onSelect(item.key)}
            disabled={item.disabled}
          >
            {item.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function ClaimRow(props: {
  row: CircuitClaimRow;
  idx: number;
  count: number;
  disabled: boolean;
  phone: boolean;
  onMove: (delta: -1 | 1, fromKeyboard: boolean) => void;
  onEdit: () => void;
  onWithdraw: () => void;
  swallowsClick: () => boolean;
  onOpenCard?: (view: ContenderPillView) => void;
}) {
  const { row, idx, count, disabled, phone } = props;
  const { label } = row;
  const { setRef, isDragging, onPointerDown, onTouchStart } = useRowSortable(
    dragId(row.claim.id),
    disabled
  );
  const onMenu = (key: CircuitClaimMenuKey) => {
    if (key === "up") props.onMove(-1, false);
    else if (key === "down") props.onMove(1, false);
    else if (key === "edit") props.onEdit();
    else props.onWithdraw();
  };
  return (
    <Box
      ref={setRef}
      component="li"
      className={[
        "season-row",
        "circuit-claimRow",
        row.chipLabel ? "has-pass" : "",
        disabled ? "" : "is-sortable",
        isDragging ? "is-dragging" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      data-claim-id={row.claim.id}
      onPointerDown={(e: PointerEvent) => {
        if (startsDrag(e.target)) onPointerDown(e);
      }}
      onTouchStart={(e: TouchEvent) => {
        if (startsDrag(e.target)) onTouchStart(e);
      }}
    >
      <Text component="span" variant="meta" className="season-rowRank">
        {idx + 1}
      </Text>
      <ClaimPills
        row={row}
        phone={phone}
        disabled={disabled}
        lifted={false}
        onEdit={() => {
          if (!props.swallowsClick()) props.onEdit();
        }}
        onMoveKey={(e) => {
          if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
          e.preventDefault();
          if (!e.repeat) props.onMove(e.key === "ArrowUp" ? -1 : 1, true);
        }}
        onOpenCard={props.onOpenCard}
      />
      {row.chipLabel ? (
        <Text
          component="span"
          variant="meta"
          className={["season-rowMeta", "circuit-claimPass"].join(" ")}
        >
          {row.chipLabel}
        </Text>
      ) : null}
      <Box className="circuit-claimActions">
        {phone ? (
          <ClaimMenu
            label={label}
            items={circuitClaimMenu({ idx, count, disabled })}
            onSelect={onMenu}
          />
        ) : (
          <>
            <ClaimIcon
              icon="arrow_upward"
              tooltip="Move up"
              label={`Move ${label} up`}
              disabled={disabled || idx === 0}
              onClick={() => props.onMove(-1, false)}
            />
            <ClaimIcon
              icon="arrow_downward"
              tooltip="Move down"
              label={`Move ${label} down`}
              disabled={disabled || idx === count - 1}
              onClick={() => props.onMove(1, false)}
            />
            <ClaimIcon
              icon="edit"
              tooltip="Edit claim"
              label={`Edit your claim for ${label}`}
              disabled={disabled}
              onClick={props.onEdit}
            />
            <ClaimIcon
              icon="close"
              tooltip="Withdraw"
              label={`Withdraw your claim for ${label}`}
              disabled={disabled}
              onClick={props.onWithdraw}
            />
          </>
        )}
      </Box>
    </Box>
  );
}

/** The lifted copy of a claim row that follows the pointer during a drag. */
function ClaimRowCopy(props: { row: CircuitClaimRow; idx: number; phone: boolean }) {
  return (
    <Box
      className={[
        "season-row",
        "circuit-claimRow",
        props.row.chipLabel ? "has-pass" : "",
        "is-dragOverlay"
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <Text component="span" variant="meta" className="season-rowRank">
        {props.idx + 1}
      </Text>
      <ClaimPills row={props.row} phone={props.phone} disabled lifted />
      {props.row.chipLabel ? (
        <Text
          component="span"
          variant="meta"
          className={["season-rowMeta", "circuit-claimPass"].join(" ")}
        >
          {props.row.chipLabel}
        </Text>
      ) : null}
      <span />
    </Box>
  );
}

/**
 * The viewer's pending claims, first choice first, one line each: rank, the
 * claim and its drop as stacked moves, the pass and the actions.
 * Reordered by dragging the row (a held finger on a phone), by Alt+ArrowUp
 * and Alt+ArrowDown on the claim pill, or by the move icons; each move is
 * announced. A click on the claim pill edits it, unless it ends a drag. On a
 * phone the four icons fold into one menu. Read-only, and not draggable,
 * once the window is being processed.
 */
export function CircuitClaimList(props: {
  rows: CircuitClaimRow[];
  editable: boolean;
  busy: boolean;
  phone: boolean;
  describedBy: string;
  onReorder: (claimIds: number[]) => void;
  onEdit: (claim: CircuitClaim) => void;
  onWithdraw: (claim: CircuitClaim) => void;
  /** Phone or coarse pointer: a tap on the drop pill opens its nominee card. */
  onOpenCard?: (view: ContenderPillView) => void;
}) {
  const { rows } = props;
  const disabled = props.busy || !props.editable;
  const sensors = useRowReorderSensors();
  const guard = useDragClickGuard();
  const ids = rows.map((r) => r.claim.id);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [movedNote, setMovedNote] = useState("");
  const listRef = useRef<HTMLOListElement | null>(null);
  // The claim pill moved from the keyboard keeps focus once the list has re-ordered.
  const refocusId = useRef<number | null>(null);
  const order = ids.join(",");

  useEffect(() => {
    const id = refocusId.current;
    if (id === null) return;
    refocusId.current = null;
    const pill = listRef.current?.querySelector<HTMLElement>(
      `[data-claim-id="${id}"] .${CLAIM_PILL}`
    );
    if (pill && document.activeElement !== pill) pill.focus();
  }, [order]);

  function reorder(next: number[], movedId: number) {
    const row = rows.find((r) => r.claim.id === movedId);
    props.onReorder(next);
    if (row) {
      setMovedNote(
        circuitClaimMovedNote(row.label, next.indexOf(movedId) + 1, next.length)
      );
    }
  }

  function onDragStart(e: DragStartEvent) {
    guard.start();
    setActiveId(idOf(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    guard.end();
    setActiveId(null);
    const movedId = idOf(e.active.id);
    const next = circuitQueueMoved(ids, movedId, idOf(e.over?.id));
    if (next) reorder(next, movedId);
  }

  function onDragCancel() {
    guard.end();
    setActiveId(null);
  }

  const activeIdx = activeId === null ? -1 : ids.indexOf(activeId);
  const activeRow = activeIdx < 0 ? null : rows[activeIdx]!;

  return (
    <DndContext
      sensors={sensors}
      accessibility={ROW_DRAG_ACCESSIBILITY}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={ids.map(dragId)} strategy={verticalListSortingStrategy}>
        <Box
          ref={listRef}
          component="ol"
          className={[
            "season-list",
            "circuit-claimList",
            "fo-pillScope",
            "fo-listReset"
          ].join(" ")}
          aria-label="Your claims"
          aria-describedby={props.describedBy}
        >
          {rows.map((row, idx) => (
            <ClaimRow
              key={row.claim.id}
              row={row}
              idx={idx}
              count={rows.length}
              disabled={disabled}
              phone={props.phone}
              onMove={(delta, fromKeyboard) => {
                if (disabled) return;
                const next = moveInOrder(ids, row.claim.id, delta);
                if (!next) return;
                if (fromKeyboard) refocusId.current = row.claim.id;
                reorder(next, row.claim.id);
              }}
              onEdit={() => props.onEdit(row.claim)}
              onWithdraw={() => props.onWithdraw(row.claim)}
              swallowsClick={guard.swallows}
              onOpenCard={props.onOpenCard}
            />
          ))}
        </Box>
      </SortableContext>
      <DragOverlay className="fo-pillScope">
        {activeRow ? (
          <ClaimRowCopy row={activeRow} idx={activeIdx} phone={props.phone} />
        ) : null}
      </DragOverlay>
      <VisuallyHidden role="status">{movedNote}</VisuallyHidden>
    </DndContext>
  );
}
