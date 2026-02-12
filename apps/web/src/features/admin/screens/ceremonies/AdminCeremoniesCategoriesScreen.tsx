import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import {
  Box,
  Button,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton
} from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError, PageLoader } from "@/shared/page-state";
import type { AdminCeremonyCategoriesOrchestration } from "@/orchestration/adminCeremoniesCategories";
import { StandardCard } from "@/primitives";
import { materialGlyph } from "@/decisions/admin/materialGlyph";
import { CategoryTemplateCombobox } from "@/features/admin/ui/ceremonies/categories/CategoryTemplateCombobox";
import { CloneCategoriesModal } from "@/features/admin/ui/ceremonies/categories/CloneCategoriesModal";
import { NewTemplateModal } from "@/features/admin/ui/ceremonies/categories/NewTemplateModal";
import { SortableCategoryRow } from "@/features/admin/ui/ceremonies/categories/SortableCategoryRow";
import { unitKindLabel } from "@/shared/labels/unitKindLabel";
import "../../../primitives/baseline.css";

export function AdminCeremoniesCategoriesScreen(props: {
  ceremonyId: number;
  o: AdminCeremonyCategoriesOrchestration;
  onAfterChange?: () => void | Promise<void>;
  onConfirmClone: () => Promise<boolean>;
  onConfirmRemoveCategory: (categoryId: number) => void;
}) {
  const { ceremonyId, o, onAfterChange, onConfirmClone, onConfirmRemoveCategory } = props;
  const [cloneOpen, setCloneOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor));

  const cloneOptions = useMemo(
    () =>
      o.ceremonyOptions
        .filter((c) => c.id !== ceremonyId)
        .map((c) => ({
          value: String(c.id),
          label: `${c.name || "(Unnamed)"}${c.code ? ` (${c.code})` : ""} #${c.id}`
        })),
    [ceremonyId, o.ceremonyOptions]
  );

  const templateOptions = useMemo(
    () =>
      o.familyResults.map((f) => ({ value: String(f.id), name: f.name, code: f.code })),
    [o.familyResults]
  );

  if (o.loading) return <PageLoader label="Loading categories..." />;
  if (o.error) return <PageError message={o.error} />;

  const hasCategories = o.categories.length > 0;
  // Keep this as a plain derived value (not a hook) to avoid hook-order changes
  // when the page transitions from loading -> loaded.
  const categoryIds = o.categories.map((c) => c.id);

  const handleAddCategory = async () => {
    const ok = await o.actions.addCategory();
    if (ok) await onAfterChange?.();
  };

  return (
    <Stack className="stack-lg" mt="md" gap="lg">
      <StandardCard tone="nested" component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Categories</Title>
            <Text className="muted">Define the award categories for this ceremony.</Text>
          </Box>
          <Box>
            <Box component="span" className="status-pill">
              {o.ceremonyStatus}
            </Box>
          </Box>
        </Group>
      </StandardCard>

      <StandardCard tone="nested" component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Current ceremony categories</Title>
            <Text className="muted">
              These determine what is draftable in this ceremony.
            </Text>
          </Box>
          <Text className="muted" size="sm">
            {o.categories.length} categories
          </Text>
        </Group>

        <Group className="admin-add-row" mt="sm" align="flex-end" wrap="nowrap">
          <CategoryTemplateCombobox
            disabled={!o.canEdit}
            value={o.selectedFamilyId || null}
            onChange={(v) => o.setSelectedFamilyId(v ?? "")}
            query={o.familyQuery}
            onQueryChange={(q) => o.setFamilyQuery(q)}
            options={templateOptions}
          />
          <Button
            type="button"
            onClick={() => void handleAddCategory()}
            disabled={!o.canEdit || o.working}
          >
            + Add
          </Button>
        </Group>

        {!o.canEdit ? (
          <Box className="status status-warning" role="status" mt="sm">
            Categories can only be edited while the ceremony is in DRAFT.
          </Box>
        ) : null}

        {!hasCategories ? (
          <Text className="muted" mt="md">
            No categories yet.
          </Text>
        ) : (
          <DndContext
            sensors={sensors}
            onDragEnd={(event) => {
              const activeId = Number(event.active?.id);
              const overId = Number(event.over?.id);
              if (!activeId || !overId || activeId === overId) return;
              const oldIndex = categoryIds.indexOf(activeId);
              const newIndex = categoryIds.indexOf(overId);
              if (oldIndex < 0 || newIndex < 0) return;
              const nextIds = arrayMove(categoryIds, oldIndex, newIndex);
              void o.actions.reorderCategories(nextIds);
            }}
          >
            <SortableContext items={categoryIds}>
              <Box
                className="admin-category-list"
                mt="md"
                role="list"
                aria-label="Ceremony categories"
              >
                {o.categories.map((c) => (
                  <SortableCategoryRow
                    key={c.id}
                    id={c.id}
                    iconVariant={c.family_icon_variant}
                    iconGlyph={materialGlyph(c.icon_code || c.family_icon_code)}
                    name={c.family_name}
                    unitKindLabel={unitKindLabel(c.unit_kind)}
                    canEdit={o.canEdit && !o.working}
                    onRemove={() => onConfirmRemoveCategory(c.id)}
                  />
                ))}
              </Box>
            </SortableContext>
          </DndContext>
        )}

        <Group className="admin-secondary-actions" mt="sm" wrap="wrap">
          <UnstyledButton
            component={Link}
            to="/admin/category-templates"
            className="link-action"
          >
            Category templates
          </UnstyledButton>
          <UnstyledButton
            type="button"
            className="link-action"
            onClick={o.openNewTemplate}
            disabled={!o.canEdit || o.working}
          >
            Create new template
          </UnstyledButton>
          <UnstyledButton
            type="button"
            className="link-action"
            onClick={() => setCloneOpen(true)}
            disabled={!o.canEdit || o.working}
          >
            Replace all categories…
          </UnstyledButton>
        </Group>

        {o.status ? <FormStatus loading={o.working} result={o.status} /> : null}

        {hasCategories ? (
          <Text className="muted" size="sm" mt="sm">
            Categories defined.
          </Text>
        ) : null}
      </StandardCard>

      {cloneOpen ? (
        <CloneCategoriesModal
          working={o.working}
          canEdit={o.canEdit}
          options={cloneOptions}
          value={o.cloneFromId}
          onChange={o.setCloneFromId}
          onCancel={() => setCloneOpen(false)}
          onSubmit={async () => {
            const ok = await onConfirmClone();
            if (ok) setCloneOpen(false);
          }}
        />
      ) : null}

      {o.newTemplateOpen ? (
        <NewTemplateModal
          working={o.working}
          canAddToCeremony={o.canEdit}
          value={o.newFamily}
          onChange={o.setNewFamily}
          onCancel={o.closeNewTemplate}
          onSubmit={async () => {
            const ok = await o.actions.createFamily();
            if (ok) {
              o.closeNewTemplate();
              await onAfterChange?.();
            }
          }}
        />
      ) : null}
    </Stack>
  );
}
