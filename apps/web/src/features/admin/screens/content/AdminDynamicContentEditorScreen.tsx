import { lazy, Suspense } from "react";
import {
  Box,
  Checkbox,
  Divider,
  Grid,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Textarea
} from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";
import type { CmsDynamicRow } from "@/orchestration/adminContent";
import { announcementStatusLabel, type DynamicKey } from "@/decisions/adminContent";
import { DynamicContentEditorHeader } from "@/features/admin/ui/content/DynamicContentEditorHeader";
import "@/primitives/baseline.css";

// Parsing happens in the browser only here; keep the parser out of the editor chunk.
const MarkdownPreview = lazy(() =>
  import("@/features/admin/ui/content/MarkdownPreview").then((m) => ({
    default: m.MarkdownPreview
  }))
);

export function AdminDynamicContentEditorScreen(props: {
  contentKey: DynamicKey | null;
  meta: { label: string } | null;
  entryId: number | null;
  loading: boolean;
  busy: boolean;
  status: ApiResult | null;
  entry: CmsDynamicRow | null;
  viewOnly: boolean;
  fields: {
    title: string;
    setTitle: (v: string) => void;
    body: string;
    setBody: (v: string) => void;
    variant: "info" | "warning" | "success" | "error";
    setVariant: (v: "info" | "warning" | "success" | "error") => void;
    dismissible: boolean;
    setDismissible: (v: boolean) => void;
    startsAtLocal: string;
    setStartsAtLocal: (v: string) => void;
    endsAtLocal: string;
    setEndsAtLocal: (v: string) => void;
    isBanner: boolean;
  };
  onSave: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const {
    contentKey,
    meta,
    entryId,
    loading,
    busy,
    status,
    entry,
    viewOnly,
    fields,
    onSave,
    onActivate,
    onDeactivate,
    onDelete
  } = props;

  if (!contentKey || !meta || entryId === null)
    return <PageError message="Invalid content key or entry id" />;
  if (loading)
    return (
      <Stack component="section" role="status" aria-label="Loading entry editor">
        <Stack gap="sm">
          <Skeleton height="var(--fo-font-size-hero-title)" width="30%" />
          <Skeleton height="var(--fo-font-size-sm)" width="34%" />
        </Stack>
        <Divider />
        <Stack gap="sm">
          <Skeleton height="56px" width="100%" />
          <Skeleton height="320px" width="100%" />
        </Stack>
      </Stack>
    );
  if (!entry) return <PageError message={status?.message ?? "Entry not found"} />;

  const isSequential = contentKey === "home_main";
  const isActive = entry.status === "PUBLISHED";

  return (
    <Stack component="section">
      <DynamicContentEditorHeader
        title={meta.label}
        statusText={`Status: ${announcementStatusLabel(entry.status)}`}
        backHref="/admin/content"
        viewOnly={viewOnly}
        busy={busy}
        isSequential={isSequential}
        isActive={isActive}
        onSave={onSave}
        onActivate={onActivate}
        onDeactivate={onDeactivate}
        onDelete={onDelete}
      />

      <Divider />

      {/* A plain flex Stack: the grid `.stack-sm` sized its column to the content,
          which left the editor phone-width on desktop. */}
      <Stack gap="sm">
        {fields.isBanner ? (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
            <Select
              label="Variant"
              value={fields.variant}
              onChange={(v) => fields.setVariant((v ?? "info") as never)}
              data={[
                { value: "info", label: "info" },
                { value: "warning", label: "warning" },
                { value: "success", label: "success" },
                { value: "error", label: "error" }
              ]}
              disabled={viewOnly}
            />
            <TextInput
              label="Starts at (optional)"
              type="datetime-local"
              value={fields.startsAtLocal}
              onChange={(e) => fields.setStartsAtLocal(e.currentTarget.value)}
              disabled={viewOnly}
            />
            <TextInput
              label="Ends at (optional)"
              type="datetime-local"
              value={fields.endsAtLocal}
              onChange={(e) => fields.setEndsAtLocal(e.currentTarget.value)}
              disabled={viewOnly}
            />
            <Checkbox
              label="Dismissible"
              checked={fields.dismissible}
              onChange={(e) => fields.setDismissible(e.currentTarget.checked)}
              disabled={viewOnly}
              mt={{ md: "lg" }}
            />
          </SimpleGrid>
        ) : null}
        <Grid gutter="lg" align="flex-start">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="sm">
              <TextInput
                label="Title"
                value={fields.title}
                onChange={(e) => fields.setTitle(e.currentTarget.value)}
                disabled={viewOnly}
              />
              <Textarea
                label="Body (Markdown)"
                value={fields.body}
                onChange={(e) => fields.setBody(e.currentTarget.value)}
                autosize
                minRows={12}
                disabled={viewOnly}
              />
              <FormStatus loading={busy} result={status} />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack component="section" gap="var(--fo-space-dense-2)" aria-label="Preview">
              <Text variant="meta" m="var(--fo-space-0)" aria-hidden="true">
                Preview
              </Text>
              <Box className="admin-contentPreview">
                {fields.body.trim() ? (
                  <Suspense fallback={null}>
                    <MarkdownPreview
                      markdown={fields.body}
                      headingBase={fields.isBanner ? undefined : 4}
                    />
                  </Suspense>
                ) : (
                  <Text variant="helper">Nothing to preview yet.</Text>
                )}
              </Box>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Stack>
  );
}
