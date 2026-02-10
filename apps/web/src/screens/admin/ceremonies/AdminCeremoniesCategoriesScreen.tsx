import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import {
  Box,
  Button,
  Checkbox,
  Combobox,
  Group,
  InputBase,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
  useCombobox
} from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type {
  AdminCeremonyCategoriesOrchestration,
  FamilyRow
} from "../../../orchestration/adminCeremoniesCategories";
import { StandardCard } from "../../../primitives";
import { materialGlyph } from "../../../decisions/admin/materialGlyph";
import { SortableCategoryRow } from "../../../ui/admin/ceremonies/categories/SortableCategoryRow";
import { unitKindLabel } from "../../../ui/labels/unitKindLabel";
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
      <StandardCard className="card nested" component="section">
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

      <StandardCard className="card nested" component="section">
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

function CategoryTemplateCombobox(props: {
  disabled: boolean;
  value: string | null;
  onChange: (v: string | null) => void;
  query: string;
  onQueryChange: (q: string) => void;
  options: Array<{ value: string; name: string; code: string }>;
}) {
  const { disabled, value, onChange, query, onQueryChange, options } = props;

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const found = options.find((o) => o.value === value);
    return found?.name ?? "";
  }, [options, value]);

  return (
    <Box className="admin-add-select">
      <Combobox
        store={combobox}
        onOptionSubmit={(val) => {
          onChange(val);
          combobox.closeDropdown();
        }}
      >
        <Combobox.Target>
          <InputBase
            component="button"
            type="button"
            disabled={disabled}
            onClick={() => combobox.toggleDropdown()}
            rightSectionPointerEvents="none"
            rightSection="▾"
            aria-label="Add category from template"
          >
            {selectedLabel || "Add category from template..."}
          </InputBase>
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Search
            value={query}
            onChange={(e) => onQueryChange(e.currentTarget.value)}
            placeholder="Search templates..."
          />
          <Combobox.Options>
            {options.length === 0 ? (
              <Combobox.Empty>
                <Text size="sm">No matching templates</Text>
              </Combobox.Empty>
            ) : (
              options.map((o) => (
                <Combobox.Option value={o.value} key={o.value}>
                  <Stack gap={2}>
                    <Text fw={700} size="sm">
                      {o.name}
                    </Text>
                    <Text className="muted" size="xs">
                      {o.code}
                    </Text>
                  </Stack>
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </Box>
  );
}

function CloneCategoriesModal(props: {
  working: boolean;
  canEdit: boolean;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: Dispatch<SetStateAction<string>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { working, canEdit, options, value, onChange, onCancel, onSubmit } = props;

  return (
    <Box className="modal-backdrop" role="presentation">
      <StandardCard
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Clone from ceremony"
      >
        <Title order={4}>Clone from ceremony</Title>
        <Text className="muted">Copy the category structure (no linkage).</Text>
        <Box className="status status-warning" role="status" mt="sm">
          This will replace all categories for the current ceremony.
        </Box>

        <Stack className="stack-sm" gap="sm" mt="sm">
          <Select
            label="Select a ceremony to clone categories from"
            placeholder="Search ceremonies..."
            searchable
            clearable
            value={value || null}
            onChange={(v) => onChange(v ?? "")}
            disabled={working || !canEdit}
            data={options}
          />
        </Stack>

        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="button" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={working || !canEdit}>
            Clone categories
          </Button>
        </Group>
      </StandardCard>
    </Box>
  );
}

function NewTemplateModal(props: {
  working: boolean;
  canAddToCeremony: boolean;
  value: {
    code: string;
    name: string;
    default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
    icon_id: string;
    icon_variant: "default" | "inverted";
    add_to_ceremony: boolean;
  };
  onChange: Dispatch<
    SetStateAction<{
      code: string;
      name: string;
      default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
      icon_id: string;
      icon_variant: "default" | "inverted";
      add_to_ceremony: boolean;
    }>
  >;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { working, canAddToCeremony, value, onChange, onCancel, onSubmit } = props;
  return (
    <Box className="modal-backdrop" role="presentation">
      <StandardCard
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="New template"
      >
        <Title order={4}>New template</Title>
        <Text className="muted">
          Create a category template, then add it to ceremonies as needed.
        </Text>

        <Stack className="stack-sm" gap="sm" mt="sm">
          <TextInput
            label="Code"
            value={value.code}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange((p) => ({ ...p, code: v }));
            }}
            placeholder="oscar-best-picture"
            disabled={working}
          />
          <TextInput
            label="Name"
            value={value.name}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange((p) => ({ ...p, name: v }));
            }}
            placeholder="Best Picture"
            disabled={working}
          />
          <Select
            label="Default nominee type"
            value={value.default_unit_kind}
            onChange={(v) =>
              onChange((p) => ({
                ...p,
                default_unit_kind: (v ?? "FILM") as FamilyRow["default_unit_kind"]
              }))
            }
            disabled={working}
            data={[
              { value: "FILM", label: "Film" },
              { value: "SONG", label: "Song" },
              { value: "PERFORMANCE", label: "Performance" }
            ]}
          />
          <TextInput
            label="Icon"
            value={value.icon_id}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange((p) => ({ ...p, icon_id: v }));
            }}
            placeholder="trophy"
            disabled={working}
          />
          <Select
            label="Icon variant"
            value={value.icon_variant}
            onChange={(v) =>
              onChange((p) => ({
                ...p,
                icon_variant: (v ?? "default") as "default" | "inverted"
              }))
            }
            disabled={working}
            data={[
              { value: "default", label: "Default" },
              { value: "inverted", label: "Inverted" }
            ]}
          />
          <Checkbox
            label="Add to this ceremony"
            checked={value.add_to_ceremony}
            onChange={(e) =>
              onChange((p) => ({ ...p, add_to_ceremony: e.currentTarget.checked }))
            }
            disabled={working || !canAddToCeremony}
          />
        </Stack>

        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="button" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={working}>
            Create template
          </Button>
        </Group>
      </StandardCard>
    </Box>
  );
}
