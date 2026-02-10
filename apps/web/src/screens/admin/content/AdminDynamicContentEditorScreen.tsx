import { Checkbox, Divider, Grid, Select, Stack, TextInput, Textarea } from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";
import type { CmsDynamicRow } from "../../../orchestration/adminContent";
import type { DynamicKey } from "../../../decisions/adminContent";
import { DynamicContentEditorHeader } from "../../../ui/admin/content/DynamicContentEditorHeader";
import "../../../primitives/baseline.css";

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
  if (loading) return <PageLoader label="Loading entry..." />;
  if (!entry) return <PageError message={status?.message ?? "Entry not found"} />;

  const isSequential = contentKey === "home_main";
  const isActive = entry.status === "PUBLISHED";

  return (
    <Stack component="section">
      <DynamicContentEditorHeader
        title={meta.label}
        statusText={`Status: ${isActive ? "Active" : "Inactive"}`}
        backHref={`/admin/content/dynamic/${contentKey}`}
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

      <Stack className="stack-sm" gap="sm">
        {fields.isBanner ? (
          <Grid gutter="lg" align="flex-start">
            <Grid.Col span={{ base: 12, md: 7 }}>
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
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Stack gap="sm">
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
                <Checkbox
                  label="Dismissible"
                  checked={fields.dismissible}
                  onChange={(e) => fields.setDismissible(e.currentTarget.checked)}
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
              </Stack>
            </Grid.Col>
          </Grid>
        ) : (
          <>
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
          </>
        )}
      </Stack>
    </Stack>
  );
}
