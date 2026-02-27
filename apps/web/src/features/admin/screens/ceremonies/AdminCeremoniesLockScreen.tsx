import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";
import "@/primitives/baseline.css";

export function AdminCeremoniesLockScreen(props: {
  loading: boolean;
  saving: boolean;
  lockState: {
    status: string;
    draft_locked: boolean;
    draft_locked_at: string | null;
  } | null;
  status: ApiResult | null;
  onArchive: () => void;
}) {
  const { loading, saving, lockState, status, onArchive } = props;
  const canArchive = lockState?.status === "COMPLETE";
  const isArchived = lockState?.status === "ARCHIVED";
  const archiveDisabledReason =
    !isArchived && !canArchive ? "Finalize winners before archiving." : null;
  const showErrorOnly = status ? !status.ok : false;

  if (loading && !lockState)
    return (
      <Stack
        className="stack-lg"
        gap="lg"
        role="status"
        aria-label="Loading archive settings"
      >
        <Box component="header">
          <Skeleton height="var(--fo-font-size-hero-title)" width="24%" />
          <Box mt="var(--fo-space-dense-2)">
            <Skeleton height="var(--fo-font-size-sm)" width="64%" />
          </Box>
        </Box>
        <Stack gap="sm">
          <Skeleton height="var(--fo-font-size-sm)" width="40%" />
          <Skeleton height="36px" width="150px" />
        </Stack>
      </Stack>
    );
  if (!lockState && status?.ok === false) return <PageError message={status.message} />;

  return (
    <Stack className="stack-lg" gap="lg">
      <Box component="header">
        <Title order={2}>Archive</Title>
        <Text className="muted">
          Archiving moves the ceremony out of active admin workflows while preserving all
          existing data.
        </Text>
      </Box>

      {!isArchived ? (
        <Group className="inline-actions" mt="sm" wrap="wrap">
          {archiveDisabledReason ? (
            <Text className="muted">{archiveDisabledReason}</Text>
          ) : null}
          <Button type="button" onClick={onArchive} disabled={saving || !canArchive}>
            {saving ? "Archiving..." : "Archive ceremony"}
          </Button>
        </Group>
      ) : null}

      {showErrorOnly ? <FormStatus loading={saving} result={status} /> : null}
    </Stack>
  );
}
