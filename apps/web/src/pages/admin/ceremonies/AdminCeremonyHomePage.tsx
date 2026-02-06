import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box } from "@mantine/core";
import { PageLoader } from "../../../ui/page-state";
import { AdminCeremonyHomeScreen } from "../../../screens/admin/ceremonies/AdminCeremonyHomeScreen";
import { useAdminCeremonyWorksheetOrchestration } from "../../../orchestration/adminCeremonyWorksheet";
import type { CeremonyWorkflowStepId } from "../../../decisions/ceremonyWorkflow";
import { useAdminCeremonyLockOrchestration } from "../../../orchestration/adminCeremonies";
import { confirm } from "../../../notifications";

function getStepPath(step: CeremonyWorkflowStepId) {
  if (step === "initialize") return "initialize";
  if (step === "structure") return "structure";
  if (step === "populate") return "populate";
  if (step === "publish") return "publish";
  if (step === "results") return "results";
  return "archive";
}

export function AdminCeremonyHomePage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  const o = useAdminCeremonyWorksheetOrchestration({ ceremonyId });
  const navigate = useNavigate();
  const archive = useAdminCeremonyLockOrchestration({ ceremonyId });

  const stepHref = useMemo(
    () => (step: CeremonyWorkflowStepId) =>
      `/admin/ceremonies/${ceremonyId}/${getStepPath(step)}`,
    [ceremonyId]
  );

  const previewHref = `/admin/ceremonies/${ceremonyId}/preview`;

  if (!ceremonyId || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
    return <Box className="status status-error">Invalid ceremony id</Box>;
  }

  if (o.state === "loading") return <PageLoader label="Loading ceremony..." />;
  if (o.state === "error")
    return (
      <Box className="status status-error">{o.error ?? "Unable to load ceremony"}</Box>
    );
  if (!o.ceremony || !o.stats) {
    return <Box className="status status-error">Ceremony not found</Box>;
  }

  return (
    <AdminCeremonyHomeScreen
      ceremony={o.ceremony}
      statusText={o.statusText}
      steps={o.steps}
      nextStep={o.nextStep}
      onOpenStep={(step) => navigate(stepHref(step))}
      previewEnabled={o.previewEnabled}
      onOpenPreview={() => {
        if (!o.previewEnabled) return;
        navigate(previewHref);
      }}
      archive={{
        saving: archive.saving,
        status: archive.status,
        onArchive: () => {
          if (o.ceremony?.status === "ARCHIVED") return;
          void confirm({
            title: "Archive ceremony?",
            message:
              "Archive this ceremony? It will be removed from current views, but remains historically visible.",
            confirmLabel: "Archive",
            cancelLabel: "Cancel"
          }).then((ok) => {
            if (ok) void archive.actions.archive().then(() => void o.reload());
          });
        }
      }}
    />
  );
}
