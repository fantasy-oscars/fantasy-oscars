import { Link } from "react-router-dom";
import { Box, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import {
  formatDateTimeForHumans,
  formatSchedule,
  type DynamicKey
} from "../../../decisions/adminContent";
import type { ApiResult } from "../../../lib/types";
import type { CmsDynamicRow } from "../../../orchestration/adminContent";

export function AdminDynamicContentLedgerScreen(props: {
  contentKey: DynamicKey | null;
  meta: { label: string; hint: string } | null;
  loading: boolean;
  busy: boolean;
  status: ApiResult | null;
  entries: CmsDynamicRow[];
  onCreateEntry: () => void;
  onPublishDraft: (draftId: number) => void;
  onUnpublishEntry: (entryId: number) => void;
}) {
  const {
    contentKey,
    meta,
    loading,
    busy,
    status,
    entries,
    onCreateEntry,
    onPublishDraft,
    onUnpublishEntry
  } = props;

  if (!contentKey || !meta) return <PageError message="Unknown dynamic content key" />;
  if (loading) return <PageLoader label="Loading entries..." />;

  return (
    <Stack component="section" className="stack">
      <Group
        className="header-with-controls"
        justify="space-between"
        align="start"
        wrap="wrap"
      >
        <Box>
          <Title order={3}>{meta.label}</Title>
          <Text className="muted">{meta.hint}</Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          <Button type="button" onClick={onCreateEntry} disabled={busy}>
            New entry
          </Button>
        </Group>
      </Group>

      <FormStatus loading={busy} result={status} />

      {entries.length === 0 ? (
        <Card className="empty-state">
          <Text fw={700}>No entries yet.</Text>
          <Text className="muted" mt="xs">
            Create a new entry to start writing.
          </Text>
        </Card>
      ) : (
        <Stack component="ul" className="list" aria-label="Content entries">
          {entries.map((e) => (
            <Box key={e.id} component="li" className="list-row">
              <Box>
                <Text fw={700}>{e.title || "(untitled)"}</Text>
                <Text className="muted">
                  {e.status === "PUBLISHED" ? "Published" : "Draft"} • updated{" "}
                  {formatDateTimeForHumans(e.updated_at)}
                  {e.published_at
                    ? ` • published ${formatDateTimeForHumans(e.published_at)}`
                    : ""}
                </Text>
              </Box>
              <Group className="inline-actions" wrap="wrap">
                {e.status === "PUBLISHED" ? (
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => onUnpublishEntry(e.id)}
                    disabled={busy}
                    title="Click to unpublish"
                  >
                    Published
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => onPublishDraft(e.id)}
                    disabled={busy}
                    title="Click to publish"
                  >
                    Draft
                  </Button>
                )}
                {e.variant ? (
                  <Box component="span" className="pill">
                    {e.variant}
                  </Box>
                ) : null}
                {formatSchedule(e.starts_at, e.ends_at) ? (
                  <Box component="span" className="pill">
                    {formatSchedule(e.starts_at, e.ends_at)}
                  </Box>
                ) : null}
                <Button
                  component={Link}
                  variant="subtle"
                  to={`/admin/content/dynamic/${contentKey}/drafts/${e.id}`}
                >
                  {e.status === "DRAFT" ? "Edit" : "View"}
                </Button>
                {e.status === "PUBLISHED" ? (
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => onUnpublishEntry(e.id)}
                    disabled={busy}
                  >
                    Unpublish
                  </Button>
                ) : null}
              </Group>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
