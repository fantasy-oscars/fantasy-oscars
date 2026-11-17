import { useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Box, Button, Group, Select, Text } from "@ui";
import { EmptyState } from "@/primitives";
import { useReorderSensors } from "@/shared/dnd/useReorderSensors";
import { circuitCategoryKindLabel, moveInOrder } from "@/decisions/admin/circuit";
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
 * move buttons. Adding one copies a category template's name, icon and kind.
 */
export function CircuitCategoriesTab(props: {
  categories: CircuitCategory[];
  templates: CircuitCategoryTemplate[];
  disabled: boolean;
  actions: CircuitCategoryActions;
}) {
  const { categories, templates, disabled, actions } = props;
  const sensors = useReorderSensors(4);
  const [adding, setAdding] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
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
    </Box>
  );
}
