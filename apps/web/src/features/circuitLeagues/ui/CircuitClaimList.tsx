import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Box, Group, Text } from "@ui";
import { useReorderSensors } from "@/shared/dnd/useReorderSensors";
import { moveInOrder } from "@/decisions/admin/circuit";
import { circuitQueueMoved } from "@/decisions/circuitDraft";
import {
  circuitSelectionCategoryLabel,
  circuitSelectionLabel
} from "@/decisions/circuitRoster";
import { circuitChipLabel } from "@/decisions/circuitWaivers";
import type { CircuitClaim } from "@/lib/types";
import {
  CircuitDragHandle,
  useSortableNode
} from "@/features/admin/ui/circuit/CircuitDragHandle";
import { CircuitRowIconButton } from "@/features/admin/ui/circuit/CircuitRowIconButton";

const dragId = (id: number) => `claim:${id}`;
const idOf = (raw: unknown) => Number(String(raw ?? "").split(":")[1]);

function ClaimRow(props: {
  claim: CircuitClaim;
  categoryNames: ReadonlyMap<number, string>;
  idx: number;
  count: number;
  disabled: boolean;
  onMove: (delta: -1 | 1) => void;
  onEdit: () => void;
  onWithdraw: () => void;
}) {
  const { claim, idx, count, disabled } = props;
  const label = circuitSelectionLabel(claim.selection);
  const named = circuitSelectionCategoryLabel(claim.selection, props.categoryNames);
  const { setRef, handle, isDragging } = useSortableNode(dragId(claim.id), disabled);
  const meta = [
    claim.drop
      ? `Drop ${circuitSelectionCategoryLabel(claim.drop, props.categoryNames)}`
      : "No drop",
    claim.chip ? circuitChipLabel(claim.chip.original_pick_number) : null
  ].filter(Boolean);
  return (
    <Box
      ref={setRef}
      component="li"
      className={`circuit-row${isDragging ? " is-dragging" : ""}`}
    >
      <CircuitDragHandle label={`Reorder ${label}`} disabled={disabled} handle={handle} />
      <Text component="span" variant="meta" className="circuit-queueRank">
        {idx + 1}
      </Text>
      <Box className="circuit-rowMain">
        <Text className="baseline-wrapAnywhere" fw="var(--fo-font-weight-bold)">
          {named}
        </Text>
        <Text variant="helper" className="baseline-textBody baseline-wrapAnywhere">
          {meta.join(" · ")}
        </Text>
      </Box>
      <Group gap="var(--fo-space-2)" wrap="nowrap" className="circuit-rowActions">
        <CircuitRowIconButton
          icon="arrow_upward"
          label={`Move ${label} up`}
          disabled={disabled || idx === 0}
          onClick={() => props.onMove(-1)}
        />
        <CircuitRowIconButton
          icon="arrow_downward"
          label={`Move ${label} down`}
          disabled={disabled || idx === count - 1}
          onClick={() => props.onMove(1)}
        />
        <CircuitRowIconButton
          icon="edit"
          label={`Edit your claim for ${label}`}
          disabled={disabled}
          onClick={props.onEdit}
        />
        <CircuitRowIconButton
          icon="close"
          label={`Withdraw your claim for ${label}`}
          disabled={disabled}
          onClick={props.onWithdraw}
        />
      </Group>
    </Box>
  );
}

/**
 * The viewer's pending claims, first choice first. Reordered by drag and
 * drop (Space, the arrow keys and Space again on a grip) or the move
 * buttons; read-only once the window is being processed.
 */
export function CircuitClaimList(props: {
  claims: CircuitClaim[];
  categoryNames: ReadonlyMap<number, string>;
  editable: boolean;
  busy: boolean;
  describedBy: string;
  onReorder: (claimIds: number[]) => void;
  onEdit: (claim: CircuitClaim) => void;
  onWithdraw: (claim: CircuitClaim) => void;
}) {
  const { claims } = props;
  const disabled = props.busy || !props.editable;
  const sensors = useReorderSensors(4);
  const ids = claims.map((c) => c.id);

  function onDragEnd(e: DragEndEvent) {
    const next = circuitQueueMoved(ids, idOf(e.active.id), idOf(e.over?.id));
    if (next) props.onReorder(next);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={ids.map(dragId)} strategy={verticalListSortingStrategy}>
        <Box
          component="ol"
          className={["circuit-list", "circuit-queue", "fo-listReset"].join(" ")}
          aria-label="Your claims"
          aria-describedby={props.describedBy}
        >
          {claims.map((claim, idx) => (
            <ClaimRow
              categoryNames={props.categoryNames}
              key={claim.id}
              claim={claim}
              idx={idx}
              count={claims.length}
              disabled={disabled}
              onMove={(delta) => {
                const next = moveInOrder(ids, claim.id, delta);
                if (next) props.onReorder(next);
              }}
              onEdit={() => props.onEdit(claim)}
              onWithdraw={() => props.onWithdraw(claim)}
            />
          ))}
        </Box>
      </SortableContext>
    </DndContext>
  );
}
