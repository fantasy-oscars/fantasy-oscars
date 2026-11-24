import { useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Box, Button, Group, Select, Text } from "@ui";
import { EmptyState } from "@/primitives";
import { useReorderSensors } from "@/shared/dnd/useReorderSensors";
import {
  circuitCategoryIconOptions,
  circuitCategoryKindLabel,
  moveInOrder
} from "@/decisions/admin/circuit";
import { DraftCategoryIcon } from "@/shared/nominee/DraftCategoryIcon";
import type {
  CircuitCategory,
  CircuitCategoryTemplate
} from "@/orchestration/adminCircuit";
import { CircuitDragHandle, useSortableNode } from "./CircuitDragHandle";
import { CircuitFormModal } from "./CircuitFormModal";
import { CircuitRenameForm } from "./CircuitRenameForm";
import { CircuitRowIconButton } from "./CircuitRowIconButton";

export type CircuitCategoryActions = {
  add: (templateId: number) => Promise<boolean>;
  rename: (categoryId: number, name: string) => Promise<boolean>;
  setIcon: (categoryId: number, icon: string) => Promise<boolean>;
  reorder: (categoryIds: number[]) => Promise<boolean>;
  remove: (categoryId: number) => void;
};

const dragId = (id: number) => `category:${id}`;

function CategoryRow(props: {
  category: CircuitCategory;
  idx: number;
  count: number;
  disabled: boolean;
  renaming: boolean;
  onRename: () => void;
  onCloseRename: () => void;
  onChangeIcon: () => void;
  onMove: (delta: -1 | 1) => void;
  actions: CircuitCategoryActions;
}) {
  const { category: c, idx, count, disabled, actions } = props;
  const { setRef, handle, isDragging } = useSortableNode(dragId(c.id), disabled);
  return (
    <Box
      ref={setRef}
      component="li"
      className={`circuit-row${isDragging ? " is-dragging" : ""}`}
    >
      {props.renaming ? (
        <Box flex={1}>
          <CircuitRenameForm
            label="Category name"
            initial={c.name}
            disabled={disabled}
            onSave={(name) => actions.rename(c.id, name)}
            onClose={props.onCloseRename}
          />
        </Box>
      ) : (
        <>
          <CircuitDragHandle
            label={`Reorder ${c.name}`}
            disabled={disabled}
            handle={handle}
          />
          <DraftCategoryIcon
            icon={c.icon_code ?? ""}
            variant={c.icon_variant === "inverted" ? "inverted" : "default"}
          />
          <Box className="fo-flex1Minw0">
            <Text fw="var(--fo-font-weight-bold)" lineClamp={1}>
              {c.name}
            </Text>
            <Text className="muted" size="sm">
              {circuitCategoryKindLabel(c.kind)}
            </Text>
          </Box>
          <Group gap="var(--fo-space-2)" wrap="nowrap">
            <CircuitRowIconButton
              icon="edit"
              label={`Rename ${c.name}`}
              disabled={disabled}
              onClick={props.onRename}
            />
            <CircuitRowIconButton
              icon="palette"
              label={`Change icon for ${c.name}`}
              disabled={disabled}
              onClick={props.onChangeIcon}
            />
            <CircuitRowIconButton
              icon="arrow_upward"
              label={`Move ${c.name} up`}
              disabled={disabled || idx === 0}
              onClick={() => props.onMove(-1)}
            />
            <CircuitRowIconButton
              icon="arrow_downward"
              label={`Move ${c.name} down`}
              disabled={disabled || idx === count - 1}
              onClick={() => props.onMove(1)}
            />
            <CircuitRowIconButton
              icon="delete"
              label={`Remove ${c.name}`}
              disabled={disabled}
              onClick={() => actions.remove(c.id)}
            />
          </Group>
        </>
      )}
    </Box>
  );
}

/**
 * The Circuit's categories: a flat list, reordered by drag and drop or the
 * move buttons. Adding one copies a category template's name, icon and kind;
 * the icon can then be changed to any template icon no other category uses.
 */
export function CircuitCategoriesTab(props: {
  categories: CircuitCategory[];
  templates: CircuitCategoryTemplate[];
  iconCodes: string[];
  disabled: boolean;
  actions: CircuitCategoryActions;
}) {
  const { categories, templates, iconCodes, disabled, actions } = props;
  const sensors = useReorderSensors(4);
  const [adding, setAdding] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [iconFor, setIconFor] = useState<CircuitCategory | null>(null);
  const [iconChoice, setIconChoice] = useState<string | null>(null);
  // The order shown while a reorder saves, so the row does not jump back.
  const [pending, setPending] = useState<number[] | null>(null);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const shown = pending
    ? pending.flatMap((id) => {
        const c = byId.get(id);
        return c ? [c] : [];
      })
    : categories;
  const ids = shown.map((c) => c.id);

  function reorder(next: number[] | null) {
    if (!next) return;
    setPending(next);
    void actions.reorder(next).finally(() => setPending(null));
  }

  function onDragEnd(e: DragEndEvent) {
    const from = ids.indexOf(Number(String(e.active.id).split(":")[1]));
    const to = ids.indexOf(Number(String(e.over?.id ?? "").split(":")[1]));
    if (from < 0 || to < 0 || from === to) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    reorder(next);
  }

  function openIcon(category: CircuitCategory) {
    setIconFor(category);
    setIconChoice(category.icon_code);
  }

  async function submitIcon() {
    if (!iconFor || !iconChoice) return;
    if (await actions.setIcon(iconFor.id, iconChoice)) setIconFor(null);
  }

  async function submitAdd() {
    if (!templateId) return;
    if (await actions.add(Number(templateId))) {
      setTemplateId(null);
      setAdding(false);
    }
  }

  return (
    <Box>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Text className="muted" flex={1} miw="var(--fo-layout-fieldMin-md)">
          Build the Circuit&apos;s categories from category templates, then map each
          ceremony&apos;s categories to them from the Ceremonies tab.
        </Text>
        <Button type="button" onClick={() => setAdding(true)} disabled={disabled}>
          Add category
        </Button>
      </Group>

      {shown.length === 0 ? (
        <Box mt="md">
          <EmptyState>No categories yet. Add one from a template.</EmptyState>
        </Box>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={ids.map(dragId)} strategy={verticalListSortingStrategy}>
            <Box
              component="ol"
              className="circuit-list fo-listReset"
              mt="md"
              aria-label="Circuit categories"
            >
              {shown.map((c, idx) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  idx={idx}
                  count={shown.length}
                  disabled={disabled || pending !== null}
                  renaming={renaming === c.id}
                  onRename={() => setRenaming(c.id)}
                  onCloseRename={() => setRenaming(null)}
                  onChangeIcon={() => openIcon(c)}
                  onMove={(delta) => reorder(moveInOrder(ids, c.id, delta))}
                  actions={actions}
                />
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      )}

      <CircuitFormModal
        opened={adding}
        title="Add a category"
        submitLabel="Add category"
        canSubmit={!disabled && Boolean(templateId)}
        onClose={() => setAdding(false)}
        onSubmit={() => void submitAdd()}
      >
        <Select
          label="Category template"
          description="Song templates are not offered. Create templates on the Category Templates screen."
          placeholder="Choose a template"
          value={templateId}
          onChange={setTemplateId}
          searchable
          data-autofocus
          nothingFoundMessage="No matching templates"
          comboboxProps={{ withinPortal: true }}
          data={templates.map((t) => ({ value: String(t.id), label: t.name }))}
        />
      </CircuitFormModal>

      <CircuitFormModal
        opened={iconFor !== null}
        title={iconFor ? `Icon for ${iconFor.name}` : "Icon"}
        submitLabel="Save icon"
        canSubmit={
          !disabled && iconChoice !== null && iconChoice !== (iconFor?.icon_code ?? null)
        }
        onClose={() => setIconFor(null)}
        onSubmit={() => void submitIcon()}
      >
        <Group gap="sm" wrap="nowrap" align="flex-end">
          <DraftCategoryIcon icon={iconChoice ?? ""} variant="default" />
          <Select
            flex={1}
            label="Icon"
            description="Season pills show a category only by its icon, so each category needs its own."
            placeholder="Choose an icon"
            value={iconChoice}
            onChange={setIconChoice}
            searchable
            data-autofocus
            nothingFoundMessage="No matching icons"
            comboboxProps={{ withinPortal: true }}
            data={
              iconFor ? circuitCategoryIconOptions(iconCodes, categories, iconFor.id) : []
            }
          />
        </Group>
      </CircuitFormModal>
    </Box>
  );
}
