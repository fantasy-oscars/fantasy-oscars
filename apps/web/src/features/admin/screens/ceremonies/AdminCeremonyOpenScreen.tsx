import { Box, Button, Group, Skeleton, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PageError } from "@/shared/page-state";
import type { ApiResult } from "@/lib/types";
import type { CeremonyStatus } from "@/decisions/ceremonyLifecycle";

export function AdminCeremonyOpenScreen(props: {
  loading: boolean;
  opening: boolean;
  loadError: string | null;
  status: ApiResult | null;
  ceremony: { status: CeremonyStatus } | null;
  canOpen: boolean;
  openDisabledReason: string | null;
  onOpen: () => void;
}) {
  const {
    loading,
    opening,
    loadError,
    status,
    ceremony,
    canOpen,
    openDisabledReason,
    onOpen
  } = props;

  if (loading && !ceremony)
    return (
      <Stack
        className="stack-lg"
        gap="lg"
        role="status"
        aria-label="Loading open for leagues"
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

  const alreadyOpen = ceremony.status !== "DRAFT" && ceremony.status !== "PUBLISHED";
  const showErrorOnly = status ? !status.ok : false;

  return (
    <Stack className="stack-lg" gap="lg">
      <Box component="header">
        <Title order={2}>Open for leagues</Title>
        <Text className="muted">
          Opening lets leagues create seasons and drafts for this ceremony. Categories and
          nominees can no longer be edited afterwards.
        </Text>
      </Box>

      {!alreadyOpen ? (
        <Stack gap="sm">
          {openDisabledReason ? (
            <Text className="muted">{openDisabledReason}</Text>
          ) : null}
          <Group className="inline-actions" wrap="wrap">
            <Button type="button" onClick={onOpen} disabled={!canOpen || opening}>
              {opening ? "Opening..." : "Open for leagues"}
            </Button>
          </Group>
          {showErrorOnly ? <FormStatus loading={opening} result={status} /> : null}
        </Stack>
      ) : (
        <Text className="muted">This ceremony is open for leagues.</Text>
      )}
    </Stack>
  );
}
