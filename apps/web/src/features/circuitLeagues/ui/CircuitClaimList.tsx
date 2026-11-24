import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ActionIcon, Box, Menu, Text, Tooltip } from "@ui";
import { useReorderSensors } from "@/shared/dnd/useReorderSensors";
import { moveInOrder } from "@/decisions/admin/circuit";
import { circuitQueueMoved } from "@/decisions/circuitDraft";
import {
  circuitClaimMenu,
  type CircuitClaimMenuKey,
  type CircuitClaimRow
} from "@/decisions/circuitWaivers";
import type { ContenderPillView } from "@/decisions/contenderPill";
import type { CircuitClaim } from "@/lib/types";
import {
  CircuitDragHandle,
  useSortableNode
} from "@/features/admin/ui/circuit/CircuitDragHandle";
import { ContenderPill } from "@/features/circuitLeagues/ui/ContenderPill";
import { ContenderNomineeCard } from "@/features/circuitLeagues/ui/ContenderCardModal";

const dragId = (id: number) => `claim:${id}`;
const idOf = (raw: unknown) => Number(String(raw ?? "").split(":")[1]);

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
  onMove: (delta: -1 | 1) => void;
  onEdit: () => void;
  onWithdraw: () => void;
  onOpenCard?: (view: ContenderPillView) => void;
}) {
  const { row, idx, count, disabled, phone } = props;
  const { label, pill, drop } = row;
  const { setRef, handle, isDragging } = useSortableNode(dragId(row.claim.id), disabled);
  const onMenu = (key: CircuitClaimMenuKey) => {
    if (key === "up") props.onMove(-1);
    else if (key === "down") props.onMove(1);
    else if (key === "edit") props.onEdit();
    else props.onWithdraw();
  };
  return (
    <Box
      ref={setRef}
      component="li"
      className={["circuit-claimRow", isDragging ? "is-dragging" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <CircuitDragHandle label={`Reorder ${label}`} disabled={disabled} handle={handle} />
      <Text component="span" variant="meta" className="circuit-queueRank">
        {idx + 1}
      </Text>
      <Box className="circuit-claimMain">
        <ContenderPill
          label={pill.label}
          categoryName={pill.categoryName}
          iconCode={pill.iconCode}
          iconVariant={pill.iconVariant}
          tooltip={phone ? undefined : <ContenderNomineeCard tooltip={pill.tooltip} />}
          onActivate={disabled ? undefined : props.onEdit}
        />
        <Box component="span" className="circuit-claimCaption">
          {drop ? (
            <>
              <Text component="span" className="dr-pill-caption">
                dropping
              </Text>
              <ContenderPill
                label={drop.label}
                categoryName={drop.categoryName}
                iconCode={drop.iconCode}
                iconVariant={drop.iconVariant}
                state="dropped"
                stateSuffix="dropped if the claim wins"
                tooltip={<ContenderNomineeCard tooltip={drop.tooltip} />}
                onOpenCard={props.onOpenCard ? () => props.onOpenCard?.(drop) : undefined}
              />
            </>
          ) : (
            <Text component="span" className="dr-pill-caption">
              No drop
            </Text>
          )}
          {row.chipLabel ? (
            <Text component="span" className="dr-pill-caption">
              · {row.chipLabel}
            </Text>
          ) : null}
        </Box>
      </Box>
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
              onClick={() => props.onMove(-1)}
            />
            <ClaimIcon
              icon="arrow_downward"
              tooltip="Move down"
              label={`Move ${label} down`}
              disabled={disabled || idx === count - 1}
              onClick={() => props.onMove(1)}
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

/**
 * The viewer's pending claims, first choice first, one line each: grip,
 * rank, the claim pill, then the drop pill (or "No drop") and the chip.
 * Reordered by drag and drop (Space, the arrow keys and Space again on a
 * grip) or the move icons; a click on the claim pill edits it. On a phone
 * the four icons fold into one menu. Read-only once the window is being
 * processed.
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
  const sensors = useReorderSensors(4);
  const ids = rows.map((r) => r.claim.id);

  function onDragEnd(e: DragEndEvent) {
    const next = circuitQueueMoved(ids, idOf(e.active.id), idOf(e.over?.id));
    if (next) props.onReorder(next);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={ids.map(dragId)} strategy={verticalListSortingStrategy}>
        <Box
          component="ol"
          className={["circuit-claimList", "fo-pillScope", "fo-listReset"].join(" ")}
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
              onMove={(delta) => {
                const next = moveInOrder(ids, row.claim.id, delta);
                if (next) props.onReorder(next);
              }}
              onEdit={() => props.onEdit(row.claim)}
              onWithdraw={() => props.onWithdraw(row.claim)}
              onOpenCard={props.onOpenCard}
            />
          ))}
        </Box>
      </SortableContext>
    </DndContext>
  );
}
