import {
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title
} from "@ui";
import type { ApiResult } from "../../../lib/types";
import type { StaticKey } from "../../../decisions/adminContent";
import { PageError, PageLoader } from "@/shared/page-state";
import "../../../primitives/baseline.css";

export function AdminStaticContentEditorScreen(props: {
  contentKey: StaticKey | null;
  meta: { label: string; hint: string } | null;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  status: ApiResult | null;
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  onSave: () => void;
}) {
  const {
    contentKey,
    meta,
    loading,
    saving,
    loadError,
    status,
    title,
    setTitle,
    body,
    setBody,
    onSave
  } = props;

  if (!contentKey || !meta) return <PageError message="Unknown static content key" />;
  if (loading) return <PageLoader label="Loading content..." />;

  return (
    <Stack component="section">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={3} className="baseline-textHeroTitle">
            {meta.label}
          </Title>
          <Text className="baseline-textBody" c="dimmed">
            {meta.hint}
          </Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </Group>
      </Group>

      <Divider />

      <Stack className="stack-sm" gap="sm">
        {loadError ? (
          <Box className="status status-error" role="status" aria-live="polite">
            {loadError} (You can still edit and save.)
          </Box>
        ) : null}
        <TextInput
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
        <Textarea
          label="Body (Markdown)"
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          autosize
          minRows={12}
        />
        {saving ? (
          <Box className="status status-loading" role="status" aria-live="polite">
            <Box component="span" className="spinner" aria-hidden="true" />{" "}
            <Text span>Saving...</Text>
          </Box>
        ) : null}
        {!saving && status ? (
          <Box
            className={`status ${status.ok ? "status-success" : "status-error"}`}
            role="status"
            aria-live="polite"
          >
            {status.message}
          </Box>
        ) : null}
      </Stack>
    </Stack>
  );
}
