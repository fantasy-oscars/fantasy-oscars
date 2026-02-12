import { Box, Button, Group, Stack, Text, Title } from "@ui";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";
import type { ApiResult } from "../../../lib/types";

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

  if (loading && !ceremony) return <PageLoader label="Loading ceremony..." />;
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
