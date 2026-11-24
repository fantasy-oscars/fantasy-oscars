import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";
import type { CeremonyStatus } from "@/decisions/ceremonyLifecycle";

export function AdminCeremonyPublishScreen(props: {
  loading: boolean;
  publishing: boolean;
  withdrawing: boolean;
  loadError: string | null;
  status: ApiResult | null;
  ceremony: { status: CeremonyStatus } | null;
  canPublish: boolean;
  publishDisabledReason: string | null;
  canWithdraw: boolean;
  onPublish: () => void;
  onWithdraw: () => void;
}) {
  const {
    loading,
    publishing,
    withdrawing,
    loadError,
    status,
    ceremony,
    canPublish,
    publishDisabledReason,
    canWithdraw,
    onPublish,
    onWithdraw
  } = props;

  if (loading && !ceremony)
    return (
      <Stack
        className="stack-lg"
        gap="lg"
        role="status"
        aria-label="Loading publish settings"
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
  if (loadError) return <PageError message={loadError} />;
  if (!ceremony) return <PageError message="Ceremony not found" />;

  const alreadyPublished = ceremony.status !== "DRAFT";
  const showErrorOnly = status ? !status.ok : false;

  return (
    <Stack className="stack-lg" gap="lg">
      <Box component="header">
        <Title order={2}>Publish</Title>
        <Text className="muted">
          Publishing makes the ceremony visible to users. Categories and nominees stay
          editable until you open it for leagues.
        </Text>
      </Box>

      {!alreadyPublished ? (
        <Stack gap="sm">
          {publishDisabledReason ? (
            <Text className="muted">{publishDisabledReason}</Text>
          ) : null}
          <Group className="inline-actions" wrap="wrap">
            <Button
              type="button"
              onClick={onPublish}
              disabled={!canPublish || publishing}
            >
              {publishing ? "Publishing..." : "Publish ceremony"}
            </Button>
          </Group>
          {showErrorOnly ? <FormStatus loading={publishing} result={status} /> : null}
        </Stack>
      ) : canWithdraw ? (
        <Stack gap="sm">
          <Text className="muted">
            Players see this ceremony as coming soon and can set up seasons. Their drafts
            start once you open it for leagues. Withdrawing returns it to draft, and is
            refused while any season is set up for it.
          </Text>
          <Group className="inline-actions" wrap="wrap">
            <Button
              type="button"
              variant="default"
              onClick={onWithdraw}
              disabled={withdrawing}
            >
              {withdrawing ? "Withdrawing..." : "Withdraw"}
            </Button>
          </Group>
          {showErrorOnly ? <FormStatus loading={withdrawing} result={status} /> : null}
        </Stack>
      ) : (
        <>{showErrorOnly ? <FormStatus loading={publishing} result={status} /> : null}</>
      )}
    </Stack>
  );
}
