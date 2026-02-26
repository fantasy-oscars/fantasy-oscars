import { Link } from "react-router-dom";
import { Box, Button, Divider, Group, Skeleton, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError } from "@/shared/page-state";
import {
  cmsDynamicEntryStatusLabel,
  formatDateTimeForHumans,
  type DynamicKey
} from "@/decisions/adminContent";
import type { ApiResult } from "@/lib/types";
import type { CmsDynamicRow } from "@/orchestration/adminContent";
import "@/primitives/baseline.css";

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
  if (loading)
    return (
      <Stack component="section" role="status" aria-label="Loading entries">
        <Group className="header-with-controls" justify="space-between" align="start" wrap="wrap">
          <Stack gap="var(--fo-space-dense-2)">
            <Skeleton height="var(--fo-font-size-hero-title)" width="28%" />
            <Skeleton height="var(--fo-font-size-sm)" width="58%" />
          </Stack>
          <Skeleton height="36px" width="120px" />
        </Group>
        <Stack gap="var(--fo-space-0)">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Box key={idx}>
              <Group justify="space-between" align="center" wrap="wrap" py="sm">
                <Stack gap="var(--fo-space-4)">
                  <Skeleton height="var(--fo-font-size-sm)" width="180px" />
                  <Skeleton height="var(--fo-font-size-xs)" width="130px" />
                </Stack>
                <Group className="inline-actions" wrap="wrap">
                  <Skeleton height="30px" width="70px" />
                  <Skeleton height="30px" width="70px" />
                </Group>
              </Group>
              {idx === 5 ? null : <Divider />}
            </Box>
          ))}
        </Stack>
      </Stack>
    );

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
        <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
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
