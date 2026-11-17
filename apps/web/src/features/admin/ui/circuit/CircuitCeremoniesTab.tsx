import { useState } from "react";
import { Link } from "react-router-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  pointerWithin,
  useDroppable,
  type Announcements,
  type CollisionDetection
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Box, Button, Group, Select, Text, TextInput, Title, UnstyledButton } from "@ui";
import { EmptyState } from "@/primitives";
import { useReorderSensors } from "@/shared/dnd/useReorderSensors";
import {
  ceremonyLabel,
  CIRCUIT_DATE_LABELS,
  dateOnlyLabel,
  type MappingChoices
} from "@/decisions/admin/circuit";
import {
  applyCircuitLayoutWrite,
  circuitDragId,
  circuitLayout,
  intoGroupWrite,
  isCircuitGroupDragId,
  locateCeremony,
  outOfGroupWrite,
  parseCircuitDragId,
  resolveCircuitDrop,
  stepCeremonyWrite,
  stepGroupWrite,
  topLevelDragIds,
  type CircuitLayout,
  type CircuitLayoutWrite
} from "@/decisions/admin/circuitLayout";
import type {
  CircuitCategory,
  CircuitCategoryEdition,
  CircuitCeremony,
  CircuitEvent
} from "@/orchestration/adminCircuit";
import { CircuitDragHandle, useSortableNode } from "./CircuitDragHandle";
import { CircuitFormModal } from "./CircuitFormModal";
import { CircuitMappingModal } from "./CircuitMappingModal";
import { CircuitRenameForm } from "./CircuitRenameForm";
import { CircuitRowMenu, type CircuitRowMenuEntry } from "./CircuitRowMenu";

export type CircuitCeremonyActions = {
  /** Appends a ceremony to the top level, ungrouped. */
  add: (ceremonyId: number) => Promise<boolean>;
  remove: (ceremonyId: number) => void;
  addGroup: (name: string) => Promise<boolean>;
  renameGroup: (eventId: number, name: string) => Promise<boolean>;
  deleteGroup: (eventId: number) => void;
  /** Saves one move or reorder of the list. */
  applyLayout: (change: CircuitLayoutWrite) => Promise<boolean>;
  saveMappings: (ceremonyId: number, choices: MappingChoices) => Promise<boolean>;
};

type RowContext = {
  layout: CircuitLayout;
  groups: CircuitEvent[];
  disabled: boolean;
  apply: (write: CircuitLayoutWrite | null) => void;
  onMap: (ceremonyId: number) => void;
  onRemove: (ceremonyId: number) => void;
};

function CeremonyRow(props: { ceremony: CircuitCeremony; ctx: RowContext }) {
  const { ceremony: c, ctx } = props;
  const label = ceremonyLabel(c);
  const { setRef, handle, isDragging } = useSortableNode(
    circuitDragId.ceremony(c.ceremony_id),
    ctx.disabled
  );
  const at = locateCeremony(ctx.layout, c.ceremony_id);
  const entries: CircuitRowMenuEntry[] = [
    {
      kind: "item",
      label: "Move up",
      icon: "arrow_upward",
      disabled: !stepCeremonyWrite(ctx.layout, c.ceremony_id, -1),
      onClick: () => ctx.apply(stepCeremonyWrite(ctx.layout, c.ceremony_id, -1))
    },
    {
      kind: "item",
      label: "Move down",
      icon: "arrow_downward",
      disabled: !stepCeremonyWrite(ctx.layout, c.ceremony_id, 1),
      onClick: () => ctx.apply(stepCeremonyWrite(ctx.layout, c.ceremony_id, 1))
    }
  ];
  const targets = ctx.groups.filter((g) => g.id !== at?.groupId);
  if (targets.length > 0 || at?.groupId != null) entries.push({ kind: "divider" });
  for (const g of targets) {
    entries.push({
      kind: "item",
      label: `Move into ${g.name}`,
      icon: "login",
      onClick: () => ctx.apply(intoGroupWrite(ctx.layout, c.ceremony_id, g.id))
    });
  }
  if (at?.groupId != null) {
    entries.push({
      kind: "item",
      label: "Move out of the group",
      icon: "logout",
      onClick: () => ctx.apply(outOfGroupWrite(ctx.layout, c.ceremony_id))
    });
  }
  entries.push(
    { kind: "divider" },
    {
      kind: "item",
      label: "Remove from the Circuit",
      icon: "link_off",
      onClick: () => ctx.onRemove(c.ceremony_id)
    }
  );

  return (
    <Box
      ref={setRef}
      component="li"
      className={`circuit-row${isDragging ? " is-dragging" : ""}`}
    >
      <CircuitDragHandle
        label={`Move ${label}`}
        disabled={ctx.disabled}
        handle={handle}
      />
      <Box className="circuit-rowMain">
        <Text
          component={Link}
          to={`/admin/ceremonies/${c.ceremony_id}/overview`}
          className="link-plain fo-block"
          fw="var(--fo-font-weight-bold)"
          lineClamp={1}
        >
          {label}
        </Text>
        <Text className="muted" size="sm">
          {CIRCUIT_DATE_LABELS.nominations_on}: {dateOnlyLabel(c.nominations_on)} ·{" "}
          {CIRCUIT_DATE_LABELS.results_on}: {dateOnlyLabel(c.results_on)}
        </Text>
      </Box>
      <Group gap="var(--fo-space-2)" wrap="nowrap" className="circuit-rowActions">
        <Button
          type="button"
          size="xs"
          variant="default"
          disabled={ctx.disabled}
          onClick={() => ctx.onMap(c.ceremony_id)}
          aria-label={`Map categories for ${label}`}
        >
          Map categories
        </Button>
        <CircuitRowMenu
          label={`More actions for ${label}`}
          disabled={ctx.disabled}
          entries={entries}
        />
      </Group>
    </Box>
  );
}

function GroupBlock(props: {
  group: CircuitEvent;
  ceremonies: CircuitCeremony[];
  collapsed: boolean;
  dropTarget: boolean;
  renaming: boolean;
  onToggle: () => void;
  onRename: () => void;
  onCloseRename: () => void;
  onRenameSave: (name: string) => Promise<boolean>;
  onDelete: () => void;
  ctx: RowContext;
}) {
  const { group, ceremonies, collapsed, ctx } = props;
  const { setRef, handle, isDragging } = useSortableNode(
    circuitDragId.group(group.id),
    ctx.disabled
  );
  const head = useDroppable({ id: circuitDragId.groupHead(group.id) });
  const body = useDroppable({ id: circuitDragId.groupBody(group.id) });
  const bodyId = `circuit-group-${group.id}`;
  const count =
    ceremonies.length === 1 ? "1 ceremony" : `${ceremonies.length} ceremonies`;
  const up = stepGroupWrite(ctx.layout, group.id, -1);
  const down = stepGroupWrite(ctx.layout, group.id, 1);

  return (
    <Box
      ref={setRef}
      component="li"
      className={[
        "circuit-group",
        isDragging ? "is-dragging" : "",
        props.dropTarget ? "is-dropTarget" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Group: ${group.name}`}
    >
      <Box ref={head.setNodeRef} className="circuit-groupHead">
        {props.renaming ? (
          <Box flex={1}>
            <CircuitRenameForm
              label="Group name"
              initial={group.name}
              disabled={ctx.disabled}
              onSave={props.onRenameSave}
              onClose={props.onCloseRename}
            />
          </Box>
        ) : (
          <>
            <CircuitDragHandle
              label={`Move group ${group.name}`}
              disabled={ctx.disabled}
              handle={handle}
            />
            <UnstyledButton
              type="button"
              className="circuit-groupToggle"
              aria-label={`${group.name}, group of ${count}`}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              onClick={props.onToggle}
            >
              <Text component="span" className="gicon" aria-hidden="true">
                {collapsed ? "chevron_right" : "expand_more"}
              </Text>
              <Box component="span" className="circuit-rowMain">
                <Title order={4} variant="section" component="span" className="fo-block">
                  {group.name}
                </Title>
                <Text component="span" className="muted fo-block" size="sm">
                  Group · {count}
                </Text>
              </Box>
            </UnstyledButton>
            <CircuitRowMenu
              label={`More actions for ${group.name}`}
              disabled={ctx.disabled}
              entries={[
                {
                  kind: "item",
                  label: "Rename group",
                  icon: "edit",
                  onClick: props.onRename
                },
                {
                  kind: "item",
                  label: "Move up",
                  icon: "arrow_upward",
                  disabled: !up,
                  onClick: () => ctx.apply(up)
                },
                {
                  kind: "item",
                  label: "Move down",
                  icon: "arrow_downward",
                  disabled: !down,
                  onClick: () => ctx.apply(down)
                },
                { kind: "divider" },
                {
                  kind: "item",
                  label: "Delete group",
                  icon: "delete",
                  onClick: props.onDelete
                }
              ]}
            />
          </>
        )}
      </Box>
      <Box ref={body.setNodeRef} id={bodyId} className="circuit-groupBody">
        {collapsed ? (
          <Text className="muted" size="sm">
            {count} hidden.
          </Text>
        ) : ceremonies.length === 0 ? (
          <Text className="muted" size="sm">
            Drag ceremonies here, or use a ceremony&apos;s menu.
          </Text>
        ) : (
          <SortableContext
            items={ceremonies.map((c) => circuitDragId.ceremony(c.ceremony_id))}
            strategy={verticalListSortingStrategy}
          >
            <Box
              component="ol"
              className="circuit-list fo-listReset"
              aria-label={`Ceremonies in ${group.name}`}
            >
              {ceremonies.map((c) => (
                <CeremonyRow key={c.ceremony_id} ceremony={c} ctx={ctx} />
              ))}
            </Box>
          </SortableContext>
        )}
      </Box>
    </Box>
  );
}

/**
 * The Circuit's ceremonies: single ceremonies and admin-named groups at the
 * top level. Drag a row by its grip to reorder it or to move it into or out
 * of a group; every drag also has a menu item.
 */
export function CircuitCeremoniesTab(props: {
  events: CircuitEvent[];
  ceremonies: CircuitCeremony[];
  categories: CircuitCategory[];
  editions: CircuitCategoryEdition[];
  addableCeremonies: Array<{ id: number; name: string | null; code: string | null }>;
  disabled: boolean;
  actions: CircuitCeremonyActions;
}) {
  const { events, ceremonies, disabled, actions } = props;
  const sensors = useReorderSensors(4);
  const [addingCeremony, setAddingCeremony] = useState(false);
  const [ceremonyId, setCeremonyId] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [renaming, setRenaming] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [mapping, setMapping] = useState<number | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // The list as it will be once a move saves, so rows do not jump back.
  const [pending, setPending] = useState<CircuitLayout | null>(null);

  const layout = pending ?? circuitLayout(events, ceremonies);
  const byId = new Map(ceremonies.map((c) => [c.ceremony_id, c]));
  const groups = events.filter((e) => e.is_group);
  const rootIds = new Set(topLevelDragIds(layout));
  const locked = disabled || pending !== null;

  function apply(write: CircuitLayoutWrite | null) {
    if (!write) return;
    setPending(applyCircuitLayoutWrite(layout, write));
    void actions.applyLayout(write).finally(() => setPending(null));
  }

  // A group only moves among top-level items. A ceremony targets rows, group
  // headers and group bodies, preferring what the pointer is over.
  const collision: CollisionDetection = (args) => {
    const movingGroup = isCircuitGroupDragId(args.active.id);
    const scoped = {
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        movingGroup ? rootIds.has(String(c.id)) : !isCircuitGroupDragId(c.id)
      )
    };
    if (!movingGroup) {
      const within = pointerWithin(scoped);
      if (within.length > 0) return within;
    }
    return closestCenter(scoped);
  };

  function dropGroupId(): number | null {
    if (!activeId || isCircuitGroupDragId(activeId)) return null;
    const over = parseCircuitDragId(overId);
    if (!over) return null;
    if (over.type === "group-body") return over.id;
    if (over.type === "ceremony") return locateCeremony(layout, over.id)?.groupId ?? null;
    return null;
  }
  const dropGroup = dropGroupId();

  /** A drag id as the admin reads it, for the overlay and screen readers. */
  function describe(value: unknown): string {
    const target = parseCircuitDragId(value);
    if (!target) return "";
    if (target.type === "ceremony") {
      const c = byId.get(target.id);
      return c ? ceremonyLabel(c) : "";
    }
    const name = events.find((e) => e.id === target.id)?.name ?? "";
    if (target.type === "group-body") return `the group ${name}`;
    if (target.type === "group-head") return `the place of the group ${name}`;
    return `the group ${name}`;
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${describe(active.id)} is over ${describe(over.id)}.`
        : `${describe(active.id)} is no longer over a drop target.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${describe(active.id)} was dropped on ${describe(over.id)}.`
        : `${describe(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${describe(active.id)} was cancelled.`
  };

  const ctx: RowContext = {
    layout,
    groups,
    disabled: locked,
    apply,
    onMap: setMapping,
    onRemove: actions.remove
  };
  const mapped = mapping === null ? null : byId.get(mapping);

  async function submitCeremony() {
    if (!ceremonyId) return;
    if (await actions.add(Number(ceremonyId))) {
      setCeremonyId(null);
      setAddingCeremony(false);
    }
  }

  async function submitGroup() {
    if (!groupName.trim()) return;
    if (await actions.addGroup(groupName)) {
      setGroupName("");
      setAddingGroup(false);
    }
  }

  return (
    <Box>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Text className="muted" flex={1} miw="var(--fo-layout-fieldMin-md)">
          Leagues enable and weight each single ceremony and each group as one. Players
          see a group by its name.
        </Text>
        <Group gap="sm" wrap="wrap">
          <Button
            type="button"
            onClick={() => setAddingCeremony(true)}
            disabled={disabled}
          >
            Add ceremony
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => setAddingGroup(true)}
            disabled={disabled}
          >
            Add group
          </Button>
        </Group>
      </Group>

      {layout.length === 0 ? (
        <Box mt="md">
          <EmptyState>No ceremonies yet.</EmptyState>
        </Box>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          accessibility={{ announcements }}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)}
          onDragCancel={() => {
            setActiveId(null);
            setOverId(null);
          }}
          onDragEnd={(e) => {
            setActiveId(null);
            setOverId(null);
            apply(resolveCircuitDrop(layout, e.active.id, e.over?.id));
          }}
        >
          <SortableContext
            items={topLevelDragIds(layout)}
            strategy={verticalListSortingStrategy}
          >
            <Box
              component="ol"
              className="circuit-list fo-listReset"
              mt="md"
              aria-label="Circuit ceremonies"
            >
              {layout.map((item) => {
                if (item.kind === "single") {
                  const c = byId.get(item.ceremonyId);
                  return c ? (
                    <CeremonyRow key={`c${item.ceremonyId}`} ceremony={c} ctx={ctx} />
                  ) : null;
                }
                const group = events.find((e) => e.id === item.eventId);
                if (!group) return null;
                return (
                  <GroupBlock
                    key={`g${item.eventId}`}
                    group={group}
                    ceremonies={item.ceremonyIds.flatMap((id) => {
                      const c = byId.get(id);
                      return c ? [c] : [];
                    })}
                    collapsed={collapsed.includes(group.id)}
                    dropTarget={dropGroup === group.id}
                    renaming={renaming === group.id}
                    onToggle={() =>
                      setCollapsed((prev) =>
                        prev.includes(group.id)
                          ? prev.filter((id) => id !== group.id)
                          : [...prev, group.id]
                      )
                    }
                    onRename={() => setRenaming(group.id)}
                    onCloseRename={() => setRenaming(null)}
                    onRenameSave={(name) => actions.renameGroup(group.id, name)}
                    onDelete={() => actions.deleteGroup(group.id)}
                    ctx={ctx}
                  />
                );
              })}
            </Box>
          </SortableContext>
          <DragOverlay>
            {activeId ? (
              <Box className="circuit-dragOverlay">
                <Text component="span" className="gicon" aria-hidden="true">
                  drag_indicator
                </Text>
                <Text fw="var(--fo-font-weight-bold)" lineClamp={1}>
                  {isCircuitGroupDragId(activeId)
                    ? (events.find((e) => e.id === parseCircuitDragId(activeId)?.id)
                        ?.name ?? "")
                    : describe(activeId)}
                </Text>
              </Box>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <CircuitFormModal
        opened={addingCeremony}
        title="Add a ceremony"
        submitLabel="Add ceremony"
        canSubmit={!disabled && Boolean(ceremonyId)}
        onClose={() => setAddingCeremony(false)}
        onSubmit={() => void submitCeremony()}
      >
        <Select
          label="Ceremony"
          description="It joins the end of the list, ungrouped."
          placeholder="Choose a ceremony"
          value={ceremonyId}
          onChange={setCeremonyId}
          searchable
          data-autofocus
          nothingFoundMessage="No other ceremonies"
          comboboxProps={{ withinPortal: true }}
          data={props.addableCeremonies.map((c) => ({
            value: String(c.id),
            label: c.name || c.code || `Ceremony ${c.id}`
          }))}
        />
      </CircuitFormModal>

      <CircuitFormModal
        opened={addingGroup}
        title="Add a group"
        submitLabel="Add group"
        canSubmit={!disabled && groupName.trim() !== ""}
        onClose={() => setAddingGroup(false)}
        onSubmit={() => void submitGroup()}
      >
        <TextInput
          label="Group name"
          description="Players see this name, for example Guild Awards."
          value={groupName}
          onChange={(e) => setGroupName(e.currentTarget.value)}
          data-autofocus
        />
      </CircuitFormModal>

      {mapped ? (
        <CircuitMappingModal
          ceremonyLabel={ceremonyLabel(mapped)}
          categories={props.categories}
          editions={props.editions.filter((e) => e.ceremony_id === mapped.ceremony_id)}
          disabled={disabled}
          onClose={() => setMapping(null)}
          onSave={(choices) => actions.saveMappings(mapped.ceremony_id, choices)}
        />
      ) : null}
    </Box>
  );
}
