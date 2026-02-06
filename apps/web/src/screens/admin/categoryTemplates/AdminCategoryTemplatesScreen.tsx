import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { StandardCard } from "../../../primitives";
import { PageError, PageLoader } from "../../../ui/page-state";
import type {
  AdminCategoryTemplatesOrchestration,
  CategoryTemplate
} from "../../../orchestration/adminCategoryTemplates";
import "../../../primitives/baseline.css";

const EDIT_ICON = String.fromCharCode(0xe3c9);
const TRASH_ICON = String.fromCharCode(0xe872);

function unitKindLabel(kind: "FILM" | "SONG" | "PERFORMANCE") {
  switch (kind) {
    case "FILM":
      return "Film";
    case "SONG":
      return "Song + Film";
    case "PERFORMANCE":
      return "Person + Film";
  }
}

export function AdminCategoryTemplatesScreen(props: {
  o: AdminCategoryTemplatesOrchestration;
  onConfirmDelete: (t: CategoryTemplate) => Promise<boolean> | boolean;
}) {
  const { o, onConfirmDelete } = props;

  if (o.loading) return <PageLoader label="Loading templates..." />;
  if (o.error) return <PageError message={o.error} />;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="end" wrap="wrap">
        <Box>
          <Title order={2} className="baseline-textHeroTitle">
            Category Templates
          </Title>
          <Text className="muted">Create, edit, and delete category templates.</Text>
        </Box>
        <Button type="button" onClick={o.openCreate} disabled={o.working}>
          New template
        </Button>
      </Group>

      <Group align="end" wrap="wrap">
        <TextInput
          label="Search"
          placeholder="Search by name or code"
          value={o.query}
          onChange={(e) => o.setQuery(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 260 }}
        />
      </Group>

      <Divider />

      <Stack gap="sm">
        {o.templates.length === 0 ? (
          <Text className="muted">No templates found.</Text>
        ) : (
          o.templates.map((t) => (
            <StandardCard key={t.id} className="card" component="section">
              <Group justify="space-between" align="start" wrap="wrap">
                <Box style={{ flex: 1, minWidth: 240 }}>
                  <Title order={4}>{t.name}</Title>
                  <Text className="muted" size="sm">
                    {t.code}
                  </Text>
                  <Text className="muted" size="sm" mt={4}>
                    Default nominee type: {unitKindLabel(t.default_unit_kind)}
                  </Text>
                </Box>
                <Group gap="xs">
                  <ActionIcon
                    variant="subtle"
                    aria-label="Edit template"
                    onClick={() => o.openEdit(t)}
                  >
                    <Text component="span" className="gicon" aria-hidden="true">
                      {EDIT_ICON}
                    </Text>
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    aria-label="Delete template"
                    onClick={async () => {
                      const ok = await onConfirmDelete(t);
                      if (ok) void o.remove(t.id);
                    }}
                  >
                    <Text component="span" className="gicon" aria-hidden="true">
                      {TRASH_ICON}
                    </Text>
                  </ActionIcon>
                </Group>
              </Group>
            </StandardCard>
          ))
        )}
      </Stack>

      <Modal
        opened={o.editorOpen}
        onClose={o.closeEditor}
        title={o.isEditing ? "Edit template" : "New template"}
        centered
        overlayProps={{ opacity: 0.35, blur: 2 }}
      >
        <Stack gap="sm">
          <TextInput
            label="Code"
            value={o.editorValue?.code ?? ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              o.setEditorValue((p) => (p ? { ...p, code: v } : p));
            }}
            placeholder="oscars-best-picture"
            disabled={o.working}
          />
          <TextInput
            label="Name"
            value={o.editorValue?.name ?? ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              o.setEditorValue((p) => (p ? { ...p, name: v } : p));
            }}
            placeholder="Best Picture"
            disabled={o.working}
          />
          <Select
            label="Default nominee type"
            value={o.editorValue?.default_unit_kind ?? "FILM"}
            onChange={(v) =>
              o.setEditorValue((p) =>
                p
                  ? {
                      ...p,
                      default_unit_kind: (v ??
                        "FILM") as CategoryTemplate["default_unit_kind"]
                    }
                  : p
              )
            }
            disabled={o.working}
            data={[
              { value: "FILM", label: "Film" },
              { value: "SONG", label: "Song" },
              { value: "PERFORMANCE", label: "Performance" }
            ]}
          />
          <TextInput
            label="Icon"
            value={o.editorValue?.icon ?? ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              o.setEditorValue((p) => (p ? { ...p, icon: v } : p));
            }}
            placeholder="trophy"
            disabled={o.working}
          />
          <Select
            label="Icon variant"
            value={o.editorValue?.icon_variant ?? "default"}
            onChange={(v) =>
              o.setEditorValue((p) =>
                p
                  ? {
                      ...p,
                      icon_variant: (v ?? "default") as "default" | "inverted"
                    }
                  : p
              )
            }
            disabled={o.working}
            data={[
              { value: "default", label: "Default" },
              { value: "inverted", label: "Inverted" }
            ]}
          />

          {o.status ? (
            <Box className={o.status.ok ? "status status-ok" : "status status-warning"}>
              {o.status.message}
            </Box>
          ) : null}

          <Group justify="flex-end" wrap="wrap">
            <Button variant="subtle" onClick={o.closeEditor} disabled={o.working}>
              Cancel
            </Button>
            <Button onClick={() => void o.save()} disabled={o.working}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
