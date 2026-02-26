import { Box, Button, Group, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError, PageLoader } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";
import { StandardCard } from "@/primitives";
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
  onLock: () => void;
  onArchive: () => void;
}) {
  const { loading, saving, lockState, status, onLock, onArchive } = props;
  const canArchive = lockState?.status === "COMPLETE";

  if (loading && !lockState) return <PageLoader label="Loading lock state..." />;
  if (!lockState && status?.ok === false) return <PageError message={status.message} />;

  return (
    <Stack component="section" className="stack" mt="md">
      <Box component="header">
        <Title order={3}>Archive</Title>
        <Text className="muted">
          Lock blocks new seasons/drafts for this ceremony and cancels in-progress drafts.
          You can archive only after results are finalized (status: Complete).
        </Text>
      </Box>

      {lockState ? (
        <StandardCard tone="nested" component="section">
          <Group
            className="header-with-controls"
            justify="space-between"
            align="start"
            wrap="wrap"
          >
            <Box>
              <Title order={4}>Status</Title>
              <Text className="muted">Current ceremony lifecycle state.</Text>
            </Box>
            <Group className="pill-list" wrap="wrap">
              <Box component="span" className="pill">
                {lockState.status}
              </Box>
              <Box
                component="span"
                className={`pill ${lockState.draft_locked ? "" : "muted"}`}
              >
                {lockState.draft_locked ? "Drafts locked" : "Drafts open"}
              </Box>
            </Group>
          </Group>
          {lockState.draft_locked_at ? (
            <Text className="muted">
              Locked at {new Date(lockState.draft_locked_at).toLocaleString()}
            </Text>
          ) : null}
        </StandardCard>
      ) : null}

      <StandardCard tone="nested" component="section">
        <Box component="header">
          <Title order={4}>Actions</Title>
          <Text className="muted">
            These actions affect all leagues/seasons for this ceremony.
          </Text>
        </Box>
        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="button" onClick={onLock} disabled={saving}>
            Lock ceremony
          </Button>
          <Button
            type="button"
            color="red"
            variant="outline"
            onClick={onArchive}
            disabled={saving || !canArchive}
          >
            Archive ceremony
          </Button>
        </Group>
        <FormStatus loading={saving} result={status} />
        <Text className="muted">
          Note: entering the first winner will also lock the ceremony automatically.
        </Text>
        {!canArchive ? (
          <Text className="muted">
            Finalize winners first to enable archiving.
          </Text>
        ) : null}
      </StandardCard>
    </Stack>
  );
}
