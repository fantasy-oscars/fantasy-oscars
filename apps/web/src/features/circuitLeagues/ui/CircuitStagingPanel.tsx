import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, TouchEvent } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ActionIcon,
  Box,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  VisuallyHidden
} from "@ui";
import { FormStatus } from "@/shared/forms";
import { useRowReorderSensors } from "@/shared/dnd/useRowReorderSensors";
import {
  ROW_DRAG_ACCESSIBILITY,
  useDragClickGuard,
  useRowSortable
} from "@/shared/dnd/useRowSortable";
import { moveInOrder } from "@/decisions/admin/circuit";
import { circuitQueueMoved, type CircuitQueueRow } from "@/decisions/circuitDraft";
import {
  circuitQueueDragHint,
  circuitQueueMovedNote,
  circuitStagingMenu,
  circuitStagingMenuTooltip,
  circuitStagingPill,
  type CircuitDraftedBy,
  type CircuitStagingMenuItem,
  type CircuitStagingMenuKey
} from "@/decisions/circuitDraftRoom";
import { contenderPillName, type ContenderPillView } from "@/decisions/contenderPill";
import type { ApiResult, CircuitSelectionSummary } from "@/lib/types";
import { DraftCategoryIcon } from "@/shared/nominee/DraftCategoryIcon";
import {
  NOMINEE_CARD_TOOLTIP_STYLES,
  NOMINEE_TOOLTIP_EVENTS,
  NOMINEE_TOOLTIP_OFFSET_PX
} from "@/shared/nominee/nomineeTooltip";
import { ContenderNomineeCard } from "@/features/circuitLeagues/ui/ContenderCardModal";

const dragId = (id: number) => `queue:${id}`;
const idOf = (raw: unknown) => Number(String(raw ?? "").split(":")[1]);
const HELP_ID = "circuit-staging-help";
const hintId = (selectionId: number) => `circuit-stage-hint-${selectionId}`;
const DRAFT_KEYS = "Enter Space Shift+Enter Escape";
const MOVE_KEYS = "Alt+ArrowUp Alt+ArrowDown";

export type CircuitStagingList = "queue" | "staged";

/** Drafting from the lists while the draft runs. */
export type CircuitStagingDraft = {
  /** The viewer may draft now (on the clock, connected, nothing in flight). */
  canDraft: boolean;
  /** How to draft from here, or why not yet. */
  note: string;
  armedId: number | null;
  /** The contender whose draft request is in flight. */
  pendingId: number | null;
  /** A click (or Enter or Space) arms a contender, or disarms the armed one. */
  onArm: (row: CircuitQueueRow) => void;
  /** Escape disarms. */
  onDisarm: () => void;
  /** A double-click, Shift+Enter or the menu's Draft drafts it. */
  onDraft: (row: CircuitQueueRow) => void;
};

/**
 * A staging contender as the ceremony board's pill button. On the clock a
 * click arms it and a double-click drafts it; from the keyboard Enter or
 * Space (on keyup) arms or disarms, Shift+Enter drafts and Escape disarms,
 * and held keys never act. On a phone a tap opens the nominee card instead.
 * A queue pill is also where a mouse drag starts, and Alt+ArrowUp or
 * Alt+ArrowDown moves it one place; the click that ends a drag does nothing.
 */
function StagingPill(props: {
  row: CircuitQueueRow;
  view: ContenderPillView;
  drafted: CircuitDraftedBy | null;
  draft: CircuitStagingDraft | null;
  phone: boolean;
  onOpenCard: () => void;
  /** Queue rows: move one place (Alt+Arrow); null while the queue cannot change. */
  onMove?: ((delta: -1 | 1) => void) | null;
  /** Queue rows: the row's pointer activator, so a mouse drag starts on the pill. */
  onDragPointerDown?: (e: PointerEvent) => void;
  /** True when a click belongs to a drag that just ended. */
  swallowsClick: () => boolean;
}) {
  const { row, view, draft, phone } = props;
  const pill = circuitStagingPill({
    selectionId: row.selection.id,
    drafted: row.drafted,
    canDraft: Boolean(draft?.canDraft),
    armedId: draft?.armedId ?? null,
    pendingId: draft?.pendingId ?? null
  });
  const armed = pill.state === "armed";
  const live = Boolean(draft) && !pill.disabled;
  const name = contenderPillName({
    categoryName: view.categoryName,
    label: view.label,
    stateSuffix: props.drafted ? `drafted by ${props.drafted.username}` : null
  });

  function onKeyDown(e: KeyboardEvent) {
    if (
      e.altKey &&
      (e.key === "ArrowUp" || e.key === "ArrowDown") &&
      props.onMove !== undefined
    ) {
      // One place per press: a held key does not keep moving it.
      e.preventDefault();
      if (!e.repeat) props.onMove?.(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (phone) return;
    if (e.repeat) {
      if (["Enter", " ", "Escape"].includes(e.key)) e.preventDefault();
      return;
    }
    if (e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      if (live) draft?.onDraft(row);
      return;
    }
    if (e.key === "Escape" && armed) {
      e.preventDefault();
      e.stopPropagation();
      draft?.onDisarm();
      return;
    }
    // Space acts on keyup, so it fires exactly once per press.
    if (e.key === " ") {
      e.preventDefault();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (live) draft?.onArm(row);
  }

  const button = (
    <UnstyledButton
      type="button"
      className={[
        "dr-pill",
        "dr-pill-btn",
        "dr-pill-standard",
        "circuit-stagePill",
        pill.state === "default" ? "" : `is-${pill.state}`
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={name}
      aria-disabled={phone ? undefined : pill.disabled}
      aria-pressed={phone ? undefined : armed}
      aria-haspopup={phone ? "dialog" : undefined}
      aria-keyshortcuts={
        props.onMove !== undefined
          ? phone
            ? MOVE_KEYS
            : `${DRAFT_KEYS} ${MOVE_KEYS}`
          : phone
            ? undefined
            : DRAFT_KEYS
      }
      data-selection-id={row.selection.id}
      aria-describedby={armed ? hintId(row.selection.id) : HELP_ID}
      onClick={(e) => {
        e.preventDefault();
        if (props.swallowsClick()) {
          e.stopPropagation();
          return;
        }
        if (phone) {
          props.onOpenCard();
          return;
        }
        e.stopPropagation();
        if (live) draft?.onArm(row);
      }}
      // A click on a pill is not a click elsewhere: it arms or disarms, not the toast's dismiss.
      onPointerDown={(e) => {
        props.onDragPointerDown?.(e);
        if (!phone) e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        if (phone || !live) return;
        e.preventDefault();
        e.stopPropagation();
        draft?.onDraft(row);
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (phone || e.key !== " ") return;
        e.preventDefault();
        if (live) draft?.onArm(row);
      }}
    >
      {armed ? (
        <Text
          component="span"
          className="mi-icon mi-icon-tiny dr-pill-armedMark"
          aria-hidden="true"
        >
          check
        </Text>
      ) : null}
      <DraftCategoryIcon
        icon={view.iconCode ?? ""}
        variant={view.iconVariant === "inverted" ? "inverted" : "default"}
        className="dr-pill-icon"
      />
      <Text component="span" className="dr-pill-text" title={view.label}>
        {view.label}
      </Text>
      {armed ? (
        <VisuallyHidden id={hintId(row.selection.id)}>
          Selected. Press Shift+Enter to draft, Escape to cancel.
        </VisuallyHidden>
      ) : null}
    </UnstyledButton>
  );
  if (phone) return button;
  return (
    <Tooltip
      events={NOMINEE_TOOLTIP_EVENTS}
      withArrow={false}
      position="bottom-start"
      multiline
      offset={NOMINEE_TOOLTIP_OFFSET_PX}
      styles={NOMINEE_CARD_TOOLTIP_STYLES}
      label={<ContenderNomineeCard tooltip={view.tooltip} drafted={props.drafted} />}
    >
      {button}
    </Tooltip>
  );
}

/**
 * The row's overflow menu: Draft while it can be drafted, then the list's
 * moves. Its tooltip says what it holds and it opens with the contender's name.
 */
function RowMenu(props: {
  label: string;
  items: CircuitStagingMenuItem[];
  onSelect: (key: CircuitStagingMenuKey) => void;
}) {
  return (
    <Menu withinPortal position="bottom-end" shadow="md">
      <Tooltip label={circuitStagingMenuTooltip(props.items)}>
        <Menu.Target>
          <ActionIcon
            type="button"
            variant="subtle"
            className="circuit-stageMenu"
            aria-label={`Actions for ${props.label}`}
          >
            <Text component="span" className="gicon" aria-hidden="true">
              more_horiz
            </Text>
          </ActionIcon>
        </Menu.Target>
      </Tooltip>
      <Menu.Dropdown>
        <Menu.Label className="circuit-stageMenuLabel" title={props.label}>
          {props.label}
        </Menu.Label>
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

type RowProps = {
  row: CircuitQueueRow;
  view: ContenderPillView;
  drafted: CircuitDraftedBy | null;
  draft: CircuitStagingDraft | null;
  phone: boolean;
  menu: CircuitStagingMenuItem[];
  onMenu: (key: CircuitStagingMenuKey) => void;
  onOpenCard: () => void;
  swallowsClick: () => boolean;
};

/**
 * A queue row: the pill and its hover menu. A mouse drags it by the pill after 6 px;
 * a finger after a 250 ms hold anywhere on the row but the menu.
 */
function QueueRow(
  props: RowProps & { disabled: boolean; onMove: (delta: -1 | 1) => void }
) {
  const { row, disabled } = props;
  const { setRef, isDragging, onPointerDown, onTouchStart } = useRowSortable(
    dragId(row.selection.id),
    disabled
  );
  return (
    <Box
      ref={setRef}
      component="li"
      className={["circuit-stageRow", "is-queued", isDragging ? "is-dragging" : ""]
        .filter(Boolean)
        .join(" ")}
      onTouchStart={(e: TouchEvent) => {
        if ((e.target as Element).closest(".circuit-stageMenu")) return;
        onTouchStart(e);
      }}
    >
      <StagingPill
        row={row}
        view={props.view}
        drafted={props.drafted}
        draft={props.draft}
        phone={props.phone}
        onOpenCard={props.onOpenCard}
        onMove={disabled ? null : props.onMove}
        onDragPointerDown={onPointerDown}
        swallowsClick={props.swallowsClick}
      />
      {props.phone ? null : (
        <RowMenu label={row.label} items={props.menu} onSelect={props.onMenu} />
      )}
    </Box>
  );
}

/** The lifted copy of a queue row that follows the pointer during a drag. */
function QueueRowCopy(props: { row: CircuitQueueRow; view: ContenderPillView }) {
  const { view } = props;
  return (
    <Box className={["circuit-stageRow", "is-dragOverlay"].join(" ")} aria-hidden="true">
      <Box
        component="span"
        className={[
          "dr-pill",
          "dr-pill-btn",
          "dr-pill-standard",
          "circuit-stagePill"
        ].join(" ")}
      >
        <DraftCategoryIcon
          icon={view.iconCode ?? ""}
          variant={view.iconVariant === "inverted" ? "inverted" : "default"}
          className="dr-pill-icon"
        />
        <Text component="span" className="dr-pill-text">
          {view.label}
        </Text>
      </Box>
    </Box>
  );
}

function StagedRow(props: RowProps) {
  return (
    <Box component="li" className="circuit-stageRow">
      <StagingPill
        row={props.row}
        view={props.view}
        drafted={props.drafted}
        draft={props.draft}
        phone={props.phone}
        onOpenCard={props.onOpenCard}
        swallowsClick={props.swallowsClick}
      />
      {props.phone ? null : (
        <RowMenu label={props.row.label} items={props.menu} onSelect={props.onMenu} />
      )}
    </Box>
  );
}

/**
 * The viewer's staging area: the ranked queue (the only source of an
 * auto-pick) and the staged contenders (set aside to draft by hand), one
 * line per contender: the pill, and a menu that appears on hover and focus. While the viewer is on the
 * clock a pill drafts by double-click, by select and confirm, or from the
 * keyboard; the menu's Draft does the same. The queue reorders by dragging
 * the pill (a held finger on a phone), by Alt+ArrowUp and Alt+ArrowDown on
 * the pill, or by the menu, which also moves a contender between the lists
 * or removes it; each move is announced. A drag never drafts: it disarms an
 * armed pill and its closing click is swallowed. On a phone a tap on a pill
 * opens the nominee card with the same actions.
 */
export function CircuitStagingPanel(props: {
  queue: CircuitQueueRow[];
  staged: CircuitQueueRow[];
  autoDraft: boolean;
  busy: boolean;
  removingSelectionId: number | null;
  status: ApiResult | null;
  /** Null outside a running draft: the pills show the card but do not draft. */
  draft: CircuitStagingDraft | null;
  viewOf: (selection: CircuitSelectionSummary) => ContenderPillView;
  draftedBy: ReadonlyMap<number, CircuitDraftedBy>;
  /** Phone or coarse pointer: a tap on a pill opens the nominee card. */
  phone: boolean;
  onOpenCard: (row: CircuitQueueRow, list: CircuitStagingList) => void;
  onRemove: (selectionId: number) => void;
  onReorder: (selectionIds: number[]) => void;
  onStage: (selection: CircuitSelectionSummary) => void;
  onQueue: (selection: CircuitSelectionSummary) => void;
  onUnstage: (selectionId: number) => void;
}) {
  const { queue, staged, busy, draft } = props;
  const sensors = useRowReorderSensors();
  const guard = useDragClickGuard();
  const ids = queue.map((r) => r.selection.id);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [movedNote, setMovedNote] = useState("");
  const listRef = useRef<HTMLOListElement | null>(null);
  // The pill moved from the keyboard keeps focus once the list has re-ordered.
  const refocusId = useRef<number | null>(null);
  const order = ids.join(",");

  useEffect(() => {
    const id = refocusId.current;
    if (id === null) return;
    refocusId.current = null;
    const pill = listRef.current?.querySelector<HTMLElement>(
      `.circuit-stagePill[data-selection-id="${id}"]`
    );
    if (pill && document.activeElement !== pill) pill.focus();
  }, [order]);

  function reorder(next: number[], movedId: number) {
    const row = queue.find((r) => r.selection.id === movedId);
    props.onReorder(next);
    if (row) {
      setMovedNote(
        circuitQueueMovedNote(row.label, next.indexOf(movedId) + 1, next.length)
      );
    }
  }

  function move(id: number, delta: -1 | 1, refocus: boolean) {
    const next = moveInOrder(ids, id, delta);
    if (!next) return;
    if (refocus) refocusId.current = id;
    reorder(next, id);
  }

  function onDragStart(e: DragStartEvent) {
    guard.start();
    setActiveId(idOf(e.active.id));
    if (draft && draft.armedId !== null) draft.onDisarm();
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

  function onMenu(row: CircuitQueueRow, key: CircuitStagingMenuKey) {
    const id = row.selection.id;
    switch (key) {
      case "draft":
        draft?.onDraft(row);
        return;
      case "up":
      case "down":
        move(id, key === "up" ? -1 : 1, false);
        return;
      case "stage":
        props.onStage(row.selection);
        return;
      case "removeQueued":
        props.onRemove(id);
        return;
      case "queue":
        props.onQueue(row.selection);
        return;
      case "removeStaged":
        props.onUnstage(id);
        return;
    }
  }

  function rowProps(row: CircuitQueueRow, list: CircuitStagingList, idx: number) {
    return {
      row,
      view: props.viewOf(row.selection),
      drafted: props.draftedBy.get(row.selection.id) ?? null,
      draft,
      phone: props.phone,
      menu: circuitStagingMenu({
        list,
        drafted: row.drafted,
        canDraft: Boolean(draft?.canDraft) && draft?.pendingId === null,
        busy,
        removing: props.removingSelectionId === row.selection.id,
        index: idx,
        count: list === "queue" ? queue.length : staged.length
      }),
      onMenu: (key: CircuitStagingMenuKey) => onMenu(row, key),
      onOpenCard: () => props.onOpenCard(row, list),
      swallowsClick: guard.swallows
    };
  }

  const hint = circuitQueueDragHint(queue.length, props.phone);
  const activeIdx = activeId === null ? -1 : ids.indexOf(activeId);
  const activeRow = activeIdx < 0 ? null : queue[activeIdx]!;

  return (
    <Stack gap="sm" className="circuit-staging">
      <Text id={HELP_ID} className="circuit-stageNote" data-testid="circuit-staging-note">
        {draft
          ? draft.note
          : props.autoDraft
            ? "Queue the contenders you want, in order: if your clock runs out, the highest one still available is drafted for you. Staged contenders are yours to draft by hand."
            : "Queue and stage the contenders you want. Auto-draft is off, so a pick missed on the clock is missed."}
      </Text>
      <FormStatus loading={false} result={props.status} />

      <Stack
        gap="var(--fo-space-4)"
        component="section"
        aria-labelledby="circuit-queue-title"
      >
        <Group justify="space-between" align="baseline" wrap="nowrap">
          <Text
            component="h3"
            className={["dr-railMeta", "circuit-stageHeading"].join(" ")}
            id="circuit-queue-title"
          >
            Queue
          </Text>
          <Text className="dr-railMeta">{queue.length}</Text>
        </Group>
        {hint ? <Text className="circuit-stageNote">{hint}</Text> : null}
        {queue.length === 0 ? (
          <Text className="circuit-stageNote">
            {props.autoDraft
              ? "Nothing queued, so nothing is drafted for you if your clock runs out."
              : "Nothing queued."}
          </Text>
        ) : (
          <DndContext
            sensors={sensors}
            accessibility={ROW_DRAG_ACCESSIBILITY}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext
              items={ids.map(dragId)}
              strategy={verticalListSortingStrategy}
            >
              <Box
                ref={listRef}
                component="ol"
                className={[
                  "circuit-stageList",
                  "circuit-queueList",
                  busy ? "" : "is-sortable",
                  draft?.canDraft ? "is-onClock" : "",
                  "fo-listReset"
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label="Your queue"
              >
                {queue.map((row, idx) => (
                  <QueueRow
                    key={row.selection.id}
                    {...rowProps(row, "queue", idx)}
                    disabled={busy}
                    onMove={(delta) => move(row.selection.id, delta, true)}
                  />
                ))}
              </Box>
            </SortableContext>
            <DragOverlay>
              {activeRow ? (
                <QueueRowCopy row={activeRow} view={props.viewOf(activeRow.selection)} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
        <VisuallyHidden role="status">{movedNote}</VisuallyHidden>
      </Stack>

      <Stack
        gap="var(--fo-space-4)"
        component="section"
        aria-labelledby="circuit-staged-title"
      >
        <Group justify="space-between" align="baseline" wrap="nowrap">
          <Text
            component="h3"
            className={["dr-railMeta", "circuit-stageHeading"].join(" ")}
            id="circuit-staged-title"
          >
            Staged
          </Text>
          <Text className="dr-railMeta">{staged.length}</Text>
        </Group>
        {staged.length === 0 ? (
          <Text className="circuit-stageNote">
            Nothing staged. Stage a contender from the form to keep it handy without
            queueing it.
          </Text>
        ) : (
          <Box
            component="ul"
            className={["circuit-stageList", "fo-listReset"].join(" ")}
            aria-label="Your staged contenders"
          >
            {staged.map((row, idx) => (
              <StagedRow key={row.selection.id} {...rowProps(row, "staged", idx)} />
            ))}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
