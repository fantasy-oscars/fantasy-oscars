import { Box, Button, Divider, Group, Stack, Text, Title, UnstyledButton } from "@ui";
import type { CeremonyDetail } from "@/orchestration/adminCeremonyWorksheet";
import type {
  CeremonyWorkflowStepId,
  CeremonyWorkflowStepStatus,
  CeremonyWorkflowStepMeta
} from "@/decisions/ceremonyWorkflow";
import { getCeremonyWorkflowStepMeta } from "@/decisions/ceremonyWorkflow";
import { isCeremonyWorkflowStepAllowed } from "@/decisions/admin/ceremonyWorkflowNav";
import { FormStatus } from "@/shared/forms";
import type { ApiResult } from "@/lib/types";
import { workflowRowStatusLabel } from "./workflowRowStatusLabel";

type WorkflowRow = {
  id: CeremonyWorkflowStepId;
  label: string;
  status: CeremonyWorkflowStepStatus;
};

export function AdminCeremonyHomeScreen(props: {
  ceremony: CeremonyDetail;
  statusText: string;
  steps: WorkflowRow[];
  nextStep: CeremonyWorkflowStepMeta | null;
  onOpenStep: (id: CeremonyWorkflowStepId) => void;
  previewEnabled: boolean;
  onOpenPreview: () => void;
  archive: {
    saving: boolean;
    status: ApiResult | null;
    onArchive: () => void;
  };
}) {
  const {
    ceremony,
    statusText,
    steps,
    nextStep,
    onOpenStep,
    previewEnabled,
    onOpenPreview,
    archive
  } = props;

  const next = nextStep ?? getCeremonyWorkflowStepMeta("initialize");
  const canArchive = ceremony.status === "COMPLETE";
  const nextAllowed =
    next.id === "archive"
      ? false
      : isCeremonyWorkflowStepAllowed({
          stepId: next.id,
          ceremonyStatus: ceremony.status
        });

  return (
    <Stack className="stack-lg" gap="lg">
      <Box component="header">
        <Title order={2}>{ceremony.name?.trim() || "(Unnamed ceremony)"}</Title>
        <Group gap="xs" wrap="wrap">
          <Box component="span" className="pill">
            {statusText}
          </Box>
        </Group>
        <Text className="muted" mt="xs">
          Use this worksheet to set up and manage a ceremony over time.
        </Text>
      </Box>

      <Box className="admin-next-step" component="section">
        <Title order={3}>Next step: {next.nextLabel}</Title>
        <Text className="muted">{next.description}</Text>
        <Button
          mt="sm"
          type="button"
          onClick={() => (nextAllowed ? onOpenStep(next.id) : null)}
          disabled={!nextAllowed}
          size="lg"
        >
          {next.cta}
        </Button>
      </Box>

      <Box component="section">
        <Title order={3}>Workflow</Title>
        <Divider my="sm" />
        <Stack gap="xs">
          {steps.map((s) => {
            const current = next.id === s.id;
            const status = workflowRowStatusLabel({ rowStatus: s.status, current });
            const allowed = isCeremonyWorkflowStepAllowed({
              stepId: s.id,
              ceremonyStatus: ceremony.status
            });
            return (
              <UnstyledButton
                key={s.id}
                type="button"
                className="admin-workflow-row"
                disabled={!allowed}
                onClick={() => (allowed ? onOpenStep(s.id) : null)}
              >
                <Group justify="space-between" wrap="nowrap" w="100%">
                  <Text span size="sm">
                    {s.label}
                  </Text>
                  <Text span className="muted" size="sm">
                    {status}
                  </Text>
                </Group>
              </UnstyledButton>
            );
          })}
        </Stack>
      </Box>

      <Divider my="lg" />

      <Box component="section">
        <Title order={3}>Preview draft board</Title>
        <Text className="muted">
          Validate draft board rendering before and after publishing.
        </Text>
        <Button mt="sm" type="button" onClick={onOpenPreview} disabled={!previewEnabled}>
          Open preview draft board
        </Button>
        {!previewEnabled ? (
          <Text className="muted small" size="sm" mt="xs">
            Add at least one category and one nominee to enable the preview.
          </Text>
        ) : null}
      </Box>

      <Divider my="lg" />

      <Box component="section" className="admin-archive">
        <Title order={3}>Archive ceremony</Title>
        <Text className="muted">
          Archiving marks the ceremony inactive and removes it from current views. This is
          available only after winners are finalized.
        </Text>
        <Button
          mt="sm"
          type="button"
          variant="subtle"
          color="red"
          onClick={archive.onArchive}
          disabled={archive.saving || ceremony.status === "ARCHIVED" || !canArchive}
        >
          Archive ceremony
        </Button>
        {!canArchive ? (
          <Text className="muted" size="sm" mt="xs">
            Finalize winners first to enable archiving.
          </Text>
        ) : null}
        <FormStatus loading={archive.saving} result={archive.status} />
      </Box>
    </Stack>
  );
}
