import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageError, PageLoader } from "@/shared/page-state";
import { AdminCeremonyHomeScreen } from "@/features/admin/screens/ceremonies/AdminCeremonyHomeScreen";
import { useAdminCeremonyWorksheetOrchestration } from "@/orchestration/adminCeremonyWorksheet";
import type { CeremonyWorkflowStepId } from "@/decisions/ceremonyWorkflow";
import { useAdminCeremonyLockOrchestration } from "@/orchestration/adminCeremonies";
import { confirm } from "@/notifications";

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
    return <PageError message="Invalid ceremony id" />;
  }

  if (o.state === "loading") return <PageLoader label="Loading ceremony..." />;
  if (o.state === "error")
    return <PageError message={o.error ?? "Unable to load ceremony"} />;
  if (!o.ceremony || !o.stats) {
    return <PageError message="Ceremony not found" />;
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
          if (o.ceremony?.status === "ARCHIVED" || o.ceremony?.status !== "COMPLETE")
            return;
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
