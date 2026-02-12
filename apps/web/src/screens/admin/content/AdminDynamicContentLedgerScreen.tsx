import { Link } from "react-router-dom";
import { Box, Button, Divider, Group, Stack, Text, Title } from "@ui";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import {
  cmsDynamicEntryStatusLabel,
  formatDateTimeForHumans,
  type DynamicKey
} from "../../../decisions/adminContent";
import type { ApiResult } from "../../../lib/types";
import type { CmsDynamicRow } from "../../../orchestration/adminContent";
import "../../../primitives/baseline.css";

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

  const isSequential = contentKey === "home_main";
  const headerTitle = meta.label;
  const headerHint = meta.hint;

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
            {headerTitle}
          </Title>
          <Text className="baseline-textBody" c="dimmed">
            {headerHint}
          </Text>
        </Box>
        <Group className="inline-actions" wrap="wrap">
          <Button type="button" onClick={onCreateEntry} disabled={busy}>
            {contentKey === "banner" ? "New banner" : "New entry"}
          </Button>
        </Group>
      </Group>

      <FormStatus loading={busy} result={status} />

      {entries.length === 0 ? (
        <Text className="baseline-textBody" c="dimmed">
          No entries yet.
        </Text>
      ) : (
        <Stack
          component="ul"
          gap="var(--fo-space-0)"
          className="fo-listReset"
        >
          {entries.map((e, idx) => (
            <Box key={e.id} component="li">
              <Group justify="space-between" align="flex-start" wrap="wrap" py="sm">
                <Box>
                  <Text fw="var(--fo-font-weight-semibold)" className="baseline-textBody">
                    {e.title || "(untitled)"}
                  </Text>
                  <Text className="baseline-textMeta" c="dimmed">
                    {cmsDynamicEntryStatusLabel(e.status)}
                    {isSequential
                      ? ` • updated ${formatDateTimeForHumans(e.updated_at)}`
                      : ""}
                  </Text>
                </Box>

                <Group className="inline-actions" wrap="wrap">
                  {isSequential ? (
                    <>
                      <Button
                        component={Link}
                        variant="subtle"
                        to={`/admin/content/dynamic/${contentKey}/drafts/${e.id}?view=1`}
                      >
                        View
                      </Button>
                      <Button
                        component={Link}
                        variant="subtle"
                        to={`/admin/content/dynamic/${contentKey}/drafts/${e.id}`}
                      >
                        Edit
                      </Button>
                      {e.status !== "PUBLISHED" ? (
                        <Button
                          type="button"
                          variant="subtle"
                          onClick={() => onPublishDraft(e.id)}
                          disabled={busy}
                        >
                          Make active
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Button
                        component={Link}
                        variant="subtle"
                        to={`/admin/content/dynamic/${contentKey}/drafts/${e.id}`}
                      >
                        Edit
                      </Button>
                      {e.status === "PUBLISHED" ? (
                        <Button
                          type="button"
                          variant="subtle"
                          onClick={() => onUnpublishEntry(e.id)}
                          disabled={busy}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="subtle"
                          onClick={() => onPublishDraft(e.id)}
                          disabled={busy}
                        >
                          Activate
                        </Button>
                      )}
                    </>
                  )}
                </Group>
              </Group>
              {idx === entries.length - 1 ? null : <Divider />}
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
