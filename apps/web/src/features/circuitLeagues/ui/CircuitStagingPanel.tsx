import { useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ActionIcon, Box, Button, Group, Menu, Stack, Text } from "@ui";
import { FormStatus } from "@/shared/forms";
import { useReorderSensors } from "@/shared/dnd/useReorderSensors";
import { moveInOrder } from "@/decisions/admin/circuit";
import { circuitQueueMoved, type CircuitQueueRow } from "@/decisions/circuitDraft";
import type { ApiResult, CircuitSelectionSummary } from "@/lib/types";
import {
  CircuitDragHandle,
  useSortableNode
} from "@/features/admin/ui/circuit/CircuitDragHandle";

const dragId = (id: number) => `queue:${id}`;
const idOf = (raw: unknown) => Number(String(raw ?? "").split(":")[1]);
const HELP_ID = "circuit-staging-help";

export type CircuitStagingDraft = {
  /** The viewer may draft now. */
  canDraft: boolean;
  /** Why the Draft buttons are off, or the prompt to use them. */
  note: string;
  picking: boolean;
  onDraft: (selection: CircuitSelectionSummary) => Promise<boolean>;
};

type RowAction = { label: string; onClick: () => void; disabled?: boolean };

function RowMain(props: { row: CircuitQueueRow }) {
  const { row } = props;
  const meta = [row.categoryName, row.drafted ? "Drafted" : null].filter(Boolean);
  return (
    <Box className="circuit-rowMain">
      <Text className="circuit-stageLabel">{row.label}</Text>
      {meta.length > 0 ? (
        <Text className="circuit-railSub">{meta.join(" · ")}</Text>
      ) : null}
    </Box>
  );
}

/** Draft (when the draft runs) and a menu of the row's other actions. */
function RowActions(props: {
  row: CircuitQueueRow;
  draft: CircuitStagingDraft | null;
  drafting: boolean;
  onDraft: () => void;
  actions: RowAction[];
}) {
  const { row, draft } = props;
  return (
    <Group gap="var(--fo-space-2)" wrap="nowrap" className="circuit-rowActions">
      {draft && !row.drafted ? (
        <Button
          size="xs"
          variant={draft.canDraft ? "filled" : "default"}
          onClick={props.onDraft}
          disabled={!draft.canDraft || (draft.picking && !props.drafting)}
          loading={props.drafting}
          aria-label={`Draft ${row.label}`}
          aria-describedby={HELP_ID}
        >
          Draft
        </Button>
      ) : null}
      <Menu withinPortal position="bottom-end" shadow="md">
        <Menu.Target>
          <ActionIcon
            type="button"
            variant="subtle"
            aria-label={`More actions for ${row.label}`}
            title="More actions"
          >
            <Text component="span" className="gicon" aria-hidden="true">
              expand_more
            </Text>
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {props.actions.map((action) => (
            <Menu.Item
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

function QueueRow(props: {
  row: CircuitQueueRow;
  idx: number;
  count: number;
  disabled: boolean;
  removing: boolean;
  draft: CircuitStagingDraft | null;
  drafting: boolean;
  onDraft: () => void;
  onMove: (delta: -1 | 1) => void;
  onStage: () => void;
  onRemove: () => void;
}) {
  const { row, idx, count, disabled } = props;
  const { setRef, handle, isDragging } = useSortableNode(
    dragId(row.selection.id),
    disabled
  );
  return (
    <Box
      ref={setRef}
      component="li"
      className={[
        "circuit-row",
        "circuit-stageRow",
        row.drafted ? "is-drafted" : "",
        isDragging ? "is-dragging" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <RowMain row={row} />
      <Box className="circuit-stageGrip">
        <CircuitDragHandle
          label={`Reorder ${row.label}`}
          disabled={disabled}
          handle={handle}
        />
      </Box>
      <Text component="span" className={["dr-railMeta", "circuit-queueRank"].join(" ")}>
        {idx + 1}
      </Text>
      <RowActions
        row={row}
        draft={props.draft}
        drafting={props.drafting}
        onDraft={props.onDraft}
        actions={[
          {
            label: "Move up",
            onClick: () => props.onMove(-1),
            disabled: disabled || idx === 0
          },
          {
            label: "Move down",
            onClick: () => props.onMove(1),
            disabled: disabled || idx === count - 1
          },
          { label: "Move to staged", onClick: props.onStage, disabled },
          {
            label: "Remove from queue",
            onClick: props.onRemove,
            disabled: disabled || props.removing
          }
        ]}
      />
    </Box>
  );
}

function StagedRow(props: {
  row: CircuitQueueRow;
  disabled: boolean;
  removing: boolean;
  draft: CircuitStagingDraft | null;
  drafting: boolean;
  onDraft: () => void;
  onQueue: () => void;
  onRemove: () => void;
}) {
  const { row, disabled } = props;
  return (
    <Box
      component="li"
      className={["circuit-row", "circuit-stageRow", row.drafted ? "is-drafted" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <RowMain row={row} />
      <RowActions
        row={row}
        draft={props.draft}
        drafting={props.drafting}
        onDraft={props.onDraft}
        actions={[
          { label: "Add to queue", onClick: props.onQueue, disabled },
          {
            label: "Remove from staged",
            onClick: props.onRemove,
            disabled: disabled || props.removing
          }
        ]}
      />
    </Box>
  );
}

/**
 * The viewer's staging area: the ranked queue (the only source of an
 * auto-pick) and the staged contenders (set aside to draft by hand). While
 * the draft runs, every contender nobody has drafted carries a Draft button,
 * live when the viewer is on the clock. The queue reorders by drag and drop
 * (Space, the arrow keys and Space again on a grip) or each row's menu, which
 * also moves a contender between the two lists or removes it.
 */
export function CircuitStagingPanel(props: {
  queue: CircuitQueueRow[];
  staged: CircuitQueueRow[];
  autoDraft: boolean;
  busy: boolean;
  removingSelectionId: number | null;
  status: ApiResult | null;
  /** Null outside a running draft: no Draft buttons. */
  draft: CircuitStagingDraft | null;
  onRemove: (selectionId: number) => void;
  onReorder: (selectionIds: number[]) => void;
  onStage: (selection: CircuitSelectionSummary) => void;
  onQueue: (selection: CircuitSelectionSummary) => void;
  onUnstage: (selectionId: number) => void;
}) {
  const { queue, staged, busy, draft } = props;
  const sensors = useReorderSensors(4);
  const ids = queue.map((r) => r.selection.id);
  const [draftingId, setDraftingId] = useState<number | null>(null);

  function onDragEnd(e: DragEndEvent) {
    const next = circuitQueueMoved(ids, idOf(e.active.id), idOf(e.over?.id));
    if (next) props.onReorder(next);
  }

  function draftRow(row: CircuitQueueRow) {
    if (!draft) return;
    setDraftingId(row.selection.id);
    void draft.onDraft(row.selection).finally(() => setDraftingId(null));
  }

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
        {queue.length === 0 ? (
          <Text className="circuit-stageNote">
            {props.autoDraft
              ? "Nothing queued, so nothing is drafted for you if your clock runs out."
              : "Nothing queued."}
          </Text>
        ) : (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <SortableContext
              items={ids.map(dragId)}
              strategy={verticalListSortingStrategy}
            >
              <Box
                component="ol"
                className={["circuit-list", "circuit-stageList", "fo-listReset"].join(
                  " "
                )}
                aria-label="Your queue"
              >
                {queue.map((row, idx) => (
                  <QueueRow
                    key={row.selection.id}
                    row={row}
                    idx={idx}
                    count={queue.length}
                    disabled={busy}
                    removing={props.removingSelectionId === row.selection.id}
                    draft={draft}
                    drafting={draftingId === row.selection.id}
                    onDraft={() => draftRow(row)}
                    onMove={(delta) => {
                      const next = moveInOrder(ids, row.selection.id, delta);
                      if (next) props.onReorder(next);
                    }}
                    onStage={() => props.onStage(row.selection)}
                    onRemove={() => props.onRemove(row.selection.id)}
                  />
                ))}
              </Box>
            </SortableContext>
          </DndContext>
        )}
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
            className={["circuit-list", "circuit-stageList", "fo-listReset"].join(" ")}
            aria-label="Your staged contenders"
          >
            {staged.map((row) => (
              <StagedRow
                key={row.selection.id}
                row={row}
                disabled={busy}
                removing={props.removingSelectionId === row.selection.id}
                draft={draft}
                drafting={draftingId === row.selection.id}
                onDraft={() => draftRow(row)}
                onQueue={() => props.onQueue(row.selection)}
                onRemove={() => props.onUnstage(row.selection.id)}
              />
            ))}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
