import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  Title
} from "@ui";
import { StandardCard } from "@/primitives";
import { PageError, PageLoader } from "@/shared/page-state";
import type {
  AdminCategoryTemplatesOrchestration,
  CategoryTemplate
} from "@/orchestration/adminCategoryTemplates";
import { CategoryTemplateEditorModal } from "@/features/admin/ui/categoryTemplates/CategoryTemplateEditorModal";
import { unitKindLabel } from "@/shared/labels/unitKindLabel";
import "../../../primitives/baseline.css";

const EDIT_ICON = String.fromCharCode(0xe3c9);
const TRASH_ICON = String.fromCharCode(0xe872);

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
        <Box flex={1} miw="var(--fo-layout-fieldBasis-sm)">
          <TextInput
            label="Search"
            placeholder="Search by name or code"
            value={o.query}
            onChange={(e) => o.setQuery(e.currentTarget.value)}
          />
        </Box>
      </Group>

      <Divider />

      <Stack gap="sm">
        {o.templates.length === 0 ? (
          <Text className="muted">No templates found.</Text>
        ) : (
          o.templates.map((t) => (
            <StandardCard key={t.id} component="section">
              <Group justify="space-between" align="start" wrap="wrap">
                <Box flex={1} miw="var(--fo-layout-fieldMin-md)">
                  <Title order={4}>{t.name}</Title>
                  <Text className="muted" size="sm">
                    {t.code}
                  </Text>
                  <Text className="muted" size="sm" mt="var(--fo-space-4)">
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

      <CategoryTemplateEditorModal
        opened={o.editorOpen}
        onClose={o.closeEditor}
        title={o.isEditing ? "Edit template" : "New template"}
        working={o.working}
        value={o.editorValue}
        setValue={o.setEditorValue}
        status={o.status}
        onSave={() => void o.save()}
      />
    </Stack>
  );
}
