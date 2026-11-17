import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Box, Divider, Group, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { useReorderSensors } from "@/shared/dnd/useReorderSensors";
import { moveInOrder } from "@/decisions/admin/circuit";
import { circuitQueueMoved, type CircuitQueueRow } from "@/decisions/circuitDraft";
import type { ApiResult } from "@/lib/types";
import {
  ContenderPicker,
  type ContenderPickerProps
} from "@/features/contenders/ui/ContenderPicker";
import {
  CircuitDragHandle,
  useSortableNode
} from "@/features/admin/ui/circuit/CircuitDragHandle";
import { CircuitRowIconButton } from "@/features/admin/ui/circuit/CircuitRowIconButton";

const dragId = (id: number) => `queue:${id}`;
const idOf = (raw: unknown) => Number(String(raw ?? "").split(":")[1]);
const HELP_ID = "circuit-queue-help";

function QueueRow(props: {
  row: CircuitQueueRow;
  idx: number;
  count: number;
  disabled: boolean;
  removing: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { row, idx, count, disabled } = props;
  const { setRef, handle, isDragging } = useSortableNode(
    dragId(row.selection.id),
    disabled
  );
  const meta = [row.categoryName, row.drafted ? "Drafted" : null].filter(Boolean);
  return (
    <Box
      ref={setRef}
      component="li"
      className={`circuit-row${row.drafted ? " is-drafted" : ""}${isDragging ? " is-dragging" : ""}`}
    >
      <CircuitDragHandle
        label={`Reorder ${row.label}`}
        disabled={disabled}
        handle={handle}
      />
      <Text component="span" variant="meta" className="circuit-queueRank">
        {idx + 1}
      </Text>
      <Box className="circuit-rowMain">
        <Text className="baseline-wrapAnywhere" fw="var(--fo-font-weight-bold)">
          {row.label}
        </Text>
        {meta.length > 0 ? (
          <Text variant="helper" className="baseline-textBody">
            {meta.join(" · ")}
          </Text>
        ) : null}
      </Box>
      <Group gap="var(--fo-space-2)" wrap="nowrap" className="circuit-rowActions">
        <CircuitRowIconButton
          icon="arrow_upward"
          label={`Move ${row.label} up`}
          disabled={disabled || idx === 0}
          onClick={() => props.onMove(-1)}
        />
        <CircuitRowIconButton
          icon="arrow_downward"
          label={`Move ${row.label} down`}
          disabled={disabled || idx === count - 1}
          onClick={() => props.onMove(1)}
        />
        <CircuitRowIconButton
          icon="close"
          label={`Remove ${row.label} from your queue`}
          disabled={disabled || props.removing}
          onClick={props.onRemove}
        />
      </Group>
    </Box>
  );
}

/**
 * The viewer's ranked queue: their crib sheet and the only source of an
 * auto-pick. Reordered by drag and drop (Space, the arrow keys and Space
 * again on a grip) or the move buttons; contenders are added through the
 * picker below. Drafted contenders stay queued and are skipped.
 */
export function CircuitQueueEditor(props: {
  rows: CircuitQueueRow[];
  autoDraft: boolean;
  busy: boolean;
  removingSelectionId: number | null;
  status: ApiResult | null;
  picker: ContenderPickerProps | null;
  onRemove: (selectionId: number) => void;
  onReorder: (selectionIds: number[]) => void;
}) {
  const { rows, busy } = props;
  const sensors = useReorderSensors(4);
  const ids = rows.map((r) => r.selection.id);

  function onDragEnd(e: DragEndEvent) {
    const next = circuitQueueMoved(ids, idOf(e.active.id), idOf(e.over?.id));
    if (next) props.onReorder(next);
  }

  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-queue-title">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3} variant="section" id="circuit-queue-title">
          Your queue
        </Title>
        <Text variant="meta">
          {rows.length === 1 ? "1 contender" : `${rows.length} contenders`}
        </Text>
      </Group>
      <Divider />
      <Text id={HELP_ID} variant="helper">
        {props.autoDraft
          ? "Rank the contenders you want. If your clock runs out, you draft the highest one still available. Nothing outside your queue is ever drafted for you."
          : "Rank the contenders you want, as a crib sheet. Auto-draft is off, so a pick missed on the clock is missed."}
      </Text>
      <FormStatus loading={false} result={props.status} />
      {rows.length === 0 ? (
        <Text className="baseline-textBody">
          Your queue is empty. Add contenders with the picker below.
        </Text>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={ids.map(dragId)} strategy={verticalListSortingStrategy}>
            <Box
              component="ol"
              className={["circuit-list", "circuit-queue", "fo-listReset"].join(" ")}
              aria-label="Your queue"
              aria-describedby={HELP_ID}
            >
              {rows.map((row, idx) => (
                <QueueRow
                  key={row.selection.id}
                  row={row}
                  idx={idx}
                  count={rows.length}
                  disabled={busy}
                  removing={props.removingSelectionId === row.selection.id}
                  onMove={(delta) => {
                    const next = moveInOrder(ids, row.selection.id, delta);
                    if (next) props.onReorder(next);
                  }}
                  onRemove={() => props.onRemove(row.selection.id)}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      )}
      {props.picker ? (
        <Stack gap="xs" component="section" aria-labelledby="circuit-queue-add">
          <Title order={4} variant="section" id="circuit-queue-add">
            Add to your queue
          </Title>
          <ContenderPicker {...props.picker} />
        </Stack>
      ) : null}
    </Stack>
  );
}
