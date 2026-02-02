import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";
import type { CmsDynamicRow } from "../../../orchestration/adminContent";
import type { DynamicKey } from "../../../decisions/adminContent";

export function AdminDynamicContentEditorScreen(props: {
  contentKey: DynamicKey | null;
  meta: { label: string } | null;
  entryId: number | null;
  loading: boolean;
  busy: boolean;
  status: ApiResult | null;
  entry: CmsDynamicRow | null;
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
  onPublish: () => void;
  onUnpublish: () => void;
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
    fields,
    onSave,
    onPublish,
    onUnpublish,
    onDelete
  } = props;

  if (!contentKey || !meta || entryId === null)
    return <PageError message="Invalid content key or entry id" />;
  if (loading) return <PageLoader label="Loading entry..." />;
  if (!entry) return <PageError message={status?.message ?? "Entry not found"} />;

  return (
    <Stack component="section" className="stack">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={3}>
            {meta.label}: {entry.status === "DRAFT" ? "Draft" : "Published"} #{entry.id}
          </Title>
          <Text className="muted">
            {entry.status === "PUBLISHED"
              ? "This entry is published. Saving will update it in place (live)."
              : "Edit the draft and publish when ready."}
          </Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          <Button
            component={Link}
            variant="subtle"
            to={`/admin/content/dynamic/${contentKey}`}
          >
            Back to ledger
          </Button>
          {entry.status === "PUBLISHED" ? (
            <>
              <Button type="button" onClick={onSave} disabled={busy}>
                Save
              </Button>
              <Button
                type="button"
                variant="subtle"
                onClick={onUnpublish}
                disabled={busy}
              >
                Unpublish
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={onSave} disabled={busy}>
                Save
              </Button>
              <Button type="button" onClick={onPublish} disabled={busy}>
                Publish
              </Button>
              <Button type="button" className="danger" onClick={onDelete} disabled={busy}>
                Delete
              </Button>
            </>
          )}
        </Group>
      </Group>

      <Card className="card nested" component="section">
        <Stack className="stack-sm" gap="sm">
          {fields.isBanner ? (
            <Stack className="stack-sm" gap="sm">
              <Box className="grid two-col">
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
                />
                <Checkbox
                  label="Dismissible"
                  checked={fields.dismissible}
                  onChange={(e) => fields.setDismissible(e.currentTarget.checked)}
                />
              </Box>

              <Box className="grid two-col">
                <TextInput
                  label="Starts at (optional)"
                  type="datetime-local"
                  value={fields.startsAtLocal}
                  onChange={(e) => fields.setStartsAtLocal(e.currentTarget.value)}
                />
                <TextInput
                  label="Ends at (optional)"
                  type="datetime-local"
                  value={fields.endsAtLocal}
                  onChange={(e) => fields.setEndsAtLocal(e.currentTarget.value)}
                />
              </Box>
            </Stack>
          ) : null}

          <TextInput
            label="Title"
            value={fields.title}
            onChange={(e) => fields.setTitle(e.currentTarget.value)}
          />
          <Textarea
            label="Body (Markdown)"
            value={fields.body}
            onChange={(e) => fields.setBody(e.currentTarget.value)}
            autosize
            minRows={12}
          />
          <FormStatus loading={busy} result={status} />
        </Stack>
      </Card>
    </Stack>
  );
}
