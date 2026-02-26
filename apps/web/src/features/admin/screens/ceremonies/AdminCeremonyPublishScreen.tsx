import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";

export function AdminCeremonyPublishScreen(props: {
  loading: boolean;
  publishing: boolean;
  loadError: string | null;
  status: ApiResult | null;
  ceremony: { status: "DRAFT" | "PUBLISHED" | "LOCKED" | "COMPLETE" | "ARCHIVED" } | null;
  canPublish: boolean;
  publishDisabledReason: string | null;
  onPublish: () => void;
}) {
  const {
    loading,
    publishing,
    loadError,
    status,
    ceremony,
    canPublish,
    publishDisabledReason,
    onPublish
  } = props;

  if (loading && !ceremony)
    return (
      <Stack className="stack-lg" gap="lg" role="status" aria-label="Loading publish settings">
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
          Publishing makes the ceremony visible to users and locks categories.
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
      ) : (
        <>{showErrorOnly ? <FormStatus loading={publishing} result={status} /> : null}</>
      )}
    </Stack>
  );
}
