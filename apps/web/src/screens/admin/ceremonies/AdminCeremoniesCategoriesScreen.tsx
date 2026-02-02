import type { Dispatch, SetStateAction } from "react";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Grid,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type {
  AdminCeremonyCategoriesOrchestration,
  FamilyRow
} from "../../../orchestration/adminCeremoniesCategories";

export function AdminCeremoniesCategoriesScreen(props: {
  ceremonyId: number;
  o: AdminCeremonyCategoriesOrchestration;
  onConfirmClone: () => void;
  onConfirmRemoveCategory: (categoryId: number) => void;
}) {
  const { ceremonyId, o, onConfirmClone, onConfirmRemoveCategory } = props;

  if (o.loading) return <PageLoader label="Loading categories..." />;
  if (o.error) return <PageError message={o.error} />;

  return (
    <Stack className="stack-lg" mt="md" gap="lg">
      <Card className="card nested" component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={3}>Categories</Title>
            <Text className="muted">Define the category set for this ceremony.</Text>
          </Box>
          <Group className="pill-list" wrap="wrap">
            <Box component="span" className="pill">
              Ceremony status: {o.ceremonyStatus}
            </Box>
            {!o.canEdit ? (
              <Box component="span" className="pill muted">
                Read-only
              </Box>
            ) : null}
          </Group>
        </Group>
        {!o.canEdit ? (
          <Box className="status status-warning" role="status">
            Categories can only be edited while the ceremony is in DRAFT.
          </Box>
        ) : null}
        <FormStatus loading={o.working} result={o.status} />
      </Card>

      <Card className="card nested" component="section">
        <Group
          className="header-with-controls"
          justify="space-between"
          align="start"
          wrap="wrap"
        >
          <Box>
            <Title order={4}>Mode</Title>
            <Text className="muted">Clone/import a set, or add/remove categories.</Text>
          </Box>
          <Group className="inline-actions" wrap="wrap">
            <Button
              type="button"
              variant={o.tab === "import" ? "default" : "subtle"}
              onClick={() => o.setTab("import")}
            >
              Import / clone
            </Button>
            <Button
              type="button"
              variant={o.tab === "edit" ? "default" : "subtle"}
              onClick={() => o.setTab("edit")}
            >
              Add / remove
            </Button>
          </Group>
        </Group>
      </Card>

      {o.tab === "import" ? (
        <Card className="card nested" component="section">
          <Box component="header">
            <Title order={4}>Import / clone</Title>
            <Text className="muted">
              Copy the category set from a previous ceremony (no linkage).
            </Text>
          </Box>
          <Group className="inline-actions" wrap="wrap" align="flex-end">
            <Select
              aria-label="Clone from ceremony"
              placeholder="Select ceremony..."
              value={o.cloneFromId || null}
              onChange={(v) => o.setCloneFromId(v ?? "")}
              disabled={!o.canEdit}
              data={o.ceremonyOptions
                .filter((c) => c.id !== ceremonyId)
                .map((c) => ({
                  value: String(c.id),
                  label: `${c.name || "(Unnamed)"}${c.code ? ` (${c.code})` : ""} #${c.id}`
                }))}
            />
            <Button
              type="button"
              onClick={onConfirmClone}
              disabled={!o.canEdit || o.working}
            >
              Clone set
            </Button>
          </Group>
          <Text className="muted" mt="sm">
            This replaces the entire set for the current ceremony. After cloning, you can
            edit the set independently.
          </Text>
        </Card>
      ) : (
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card className="card nested" component="section">
              <Box component="header">
                <Title order={4}>Templates</Title>
                <Text className="muted">
                  Search templates and add them to this ceremony.
                </Text>
              </Box>

              <Group className="inline-actions" wrap="wrap" align="flex-end">
                <TextInput
                  type="search"
                  placeholder="Search templates..."
                  value={o.familyQuery}
                  onChange={(e) => o.setFamilyQuery(e.currentTarget.value)}
                  disabled={!o.canEdit}
                />
                <Button
                  type="button"
                  onClick={() => void o.actions.searchFamilies()}
                  disabled={!o.canEdit}
                >
                  {o.familyQuery.trim() ? "Search" : "Show all"}
                </Button>
              </Group>

              <Group className="inline-actions" wrap="wrap" mt="sm">
                <Select
                  placeholder="Select template..."
                  value={o.selectedFamilyId || null}
                  onChange={(v) => o.setSelectedFamilyId(v ?? "")}
                  disabled={!o.canEdit || o.familyResults.length === 0}
                  data={o.familyResults.map((f) => ({
                    value: String(f.id),
                    label: `${f.code} — ${f.name}`
                  }))}
                />
                <Button
                  type="button"
                  onClick={() => void o.actions.addCategory()}
                  disabled={!o.canEdit || o.working}
                >
                  Add
                </Button>
              </Group>

              <Button
                type="button"
                variant="subtle"
                onClick={o.openNewTemplate}
                disabled={o.working}
                mt="sm"
              >
                New template…
              </Button>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 8 }}>
            <Card className="card nested" component="section">
              <Group
                className="header-with-controls"
                justify="space-between"
                align="start"
                wrap="wrap"
              >
                <Box>
                  <Title order={4}>Current ceremony categories</Title>
                  <Text className="muted">
                    Short list. Remove and replace via templates if needed.
                  </Text>
                </Box>
                <Box component="span" className="pill">
                  {o.categories.length} categories
                </Box>
              </Group>

              {o.categories.length === 0 ? (
                <Card className="empty-state">
                  <Text fw={700}>No categories yet.</Text>
                  <Text className="muted" mt="xs">
                    Clone from a prior ceremony or add templates on the left.
                  </Text>
                </Card>
              ) : (
                <Stack className="list" gap="sm">
                  {o.categories.map((c) => (
                    <Box key={c.id} className="list-row">
                      <Box>
                        <Group className="inline-actions" wrap="wrap">
                          <Text fw={700}>{c.family_name}</Text>
                          <Button
                            type="button"
                            variant="subtle"
                            aria-label="Category details"
                            title="Details"
                            onClick={() =>
                              o.setExpandedCategoryId((prev) =>
                                prev === c.id ? null : c.id
                              )
                            }
                          >
                            i
                          </Button>
                        </Group>
                        {o.expandedCategoryId === c.id ? (
                          <Box className="status status-info" mt="sm">
                            <Group className="pill-list" wrap="wrap">
                              <Box component="span" className="pill">
                                Template: {c.family_code}
                              </Box>
                              <Box component="span" className="pill">
                                Type: {c.unit_kind}
                              </Box>
                              <Box component="span" className="pill">
                                Icon: {c.icon_code || c.family_icon_code}
                              </Box>
                              <Box component="span" className="pill muted">
                                Sort: {c.sort_index}
                              </Box>
                            </Group>
                            <Group className="inline-actions" mt="sm" wrap="wrap">
                              <Button
                                type="button"
                                variant="subtle"
                                onClick={() =>
                                  o.setEditingTemplate({
                                    id: c.family_id,
                                    code: c.family_code,
                                    name: c.family_name,
                                    default_unit_kind: c.family_default_unit_kind,
                                    icon_id: c.family_icon_id,
                                    icon_code: c.family_icon_code
                                  })
                                }
                                disabled={o.working}
                              >
                                Edit template
                              </Button>
                            </Group>
                            <Text className="muted" mt="xs">
                              Warning: editing a template changes it everywhere it is
                              used.
                            </Text>
                          </Box>
                        ) : null}
                      </Box>
                      <Group className="pill-actions" wrap="wrap">
                        <Button
                          type="button"
                          className="danger"
                          onClick={() => onConfirmRemoveCategory(c.id)}
                          disabled={!o.canEdit || o.working}
                        >
                          Remove
                        </Button>
                      </Group>
                    </Box>
                  ))}
                </Stack>
              )}
            </Card>
          </Grid.Col>
        </Grid>
      )}

      {o.newTemplateOpen ? (
        <NewTemplateModal
          working={o.working}
          canAddToCeremony={o.canEdit}
          value={o.newFamily}
          onChange={o.setNewFamily}
          onCancel={o.closeNewTemplate}
          onSubmit={async () => {
            const ok = await o.actions.createFamily();
            if (ok) o.closeNewTemplate();
          }}
        />
      ) : null}

      {o.editingTemplate && o.editTemplateValue ? (
        <EditTemplateModal
          working={o.working}
          iconCodes={o.iconCodes}
          value={o.editTemplateValue}
          onChange={o.setEditTemplateValue}
          onCancel={o.actions.closeEditTemplate}
          onSubmit={(next) => void o.actions.saveTemplateEdits(next)}
        />
      ) : null}
    </Stack>
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
    add_to_ceremony: boolean;
  };
  onChange: Dispatch<
    SetStateAction<{
      code: string;
      name: string;
      default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
      icon_id: string;
      add_to_ceremony: boolean;
    }>
  >;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { working, canAddToCeremony, value, onChange, onCancel, onSubmit } = props;
  return (
    <Box className="modal-backdrop" role="presentation">
      <Card className="modal" role="dialog" aria-modal="true" aria-label="New template">
        <Title order={4}>New template</Title>
        <Text className="muted">
          Create a category template, then add it to ceremonies as needed.
        </Text>

        <Stack className="stack-sm" gap="sm" mt="sm">
          <TextInput
            label="Code"
            value={value.code}
            onChange={(e) => onChange((p) => ({ ...p, code: e.currentTarget.value }))}
            placeholder="oscar-best-picture"
            disabled={working}
          />
          <TextInput
            label="Name"
            value={value.name}
            onChange={(e) => onChange((p) => ({ ...p, name: e.currentTarget.value }))}
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
            label="Icon (text)"
            value={value.icon_id}
            onChange={(e) => onChange((p) => ({ ...p, icon_id: e.currentTarget.value }))}
            placeholder="e4eb or e4eb-i"
            disabled={working}
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
      </Card>
    </Box>
  );
}

function EditTemplateModal(props: {
  working: boolean;
  iconCodes: string[];
  value: {
    id: number;
    code: string;
    name: string;
    default_unit_kind: FamilyRow["default_unit_kind"];
    icon: string;
  };
  onChange: Dispatch<
    SetStateAction<{
      id: number;
      code: string;
      name: string;
      default_unit_kind: FamilyRow["default_unit_kind"];
      icon: string;
    } | null>
  >;
  onCancel: () => void;
  onSubmit: (next: {
    id: number;
    code: string;
    name: string;
    default_unit_kind: FamilyRow["default_unit_kind"];
    icon: string;
  }) => void;
}) {
  const { working, value, onChange, onCancel, onSubmit } = props;

  return (
    <Box className="modal-backdrop" role="presentation">
      <Card className="modal" role="dialog" aria-modal="true" aria-label="Edit template">
        <Title order={4}>Edit template</Title>
        <Text className="muted">This changes the template everywhere it is used.</Text>

        <Stack className="stack-sm" gap="sm" mt="sm">
          <TextInput
            label="Code"
            value={value.code}
            onChange={(e) =>
              onChange((p) => (p ? { ...p, code: e.currentTarget.value } : p))
            }
            disabled={working}
          />
          <TextInput
            label="Name"
            value={value.name}
            onChange={(e) =>
              onChange((p) => (p ? { ...p, name: e.currentTarget.value } : p))
            }
            disabled={working}
          />
          <Select
            label="Default nominee type"
            value={value.default_unit_kind}
            onChange={(v) =>
              onChange((p) =>
                p
                  ? {
                      ...p,
                      default_unit_kind: (v ?? "FILM") as FamilyRow["default_unit_kind"]
                    }
                  : p
              )
            }
            disabled={working}
            data={[
              { value: "FILM", label: "Film" },
              { value: "SONG", label: "Song" },
              { value: "PERFORMANCE", label: "Performance" }
            ]}
          />
          <TextInput
            label="Icon (text)"
            value={value.icon}
            onChange={(e) =>
              onChange((p) => (p ? { ...p, icon: e.currentTarget.value } : p))
            }
            placeholder="e4eb or e4eb-i"
            disabled={working}
          />
        </Stack>

        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="button" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onSubmit(value)} disabled={working}>
            Save template
          </Button>
        </Group>
      </Card>
    </Box>
  );
}
