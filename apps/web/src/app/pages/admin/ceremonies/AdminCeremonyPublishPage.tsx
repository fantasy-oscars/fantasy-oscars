import { useParams } from "react-router-dom";
import { useMemo } from "react";
import { AdminCeremonyPublishScreen } from "@/features/admin/screens/ceremonies/AdminCeremonyPublishScreen";
import { useAdminCeremonyOverviewOrchestration } from "@/orchestration/adminCeremonies";
import { useCeremonyWizardContext } from "./ceremonyWizardContext";

export function AdminCeremonyPublishPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  const wizard = useCeremonyWizardContext();
  const o = useAdminCeremonyOverviewOrchestration({ ceremonyId });

  const publishDisabledReason = useMemo(() => {
    const c = o.ceremony;
    if (!c) return null;
    if (c.status !== "DRAFT") return null;
    if (!c.code?.trim() || !c.name?.trim()) {
      return "Add a ceremony name and code before publishing.";
    }
    return null;
  }, [o.ceremony]);

  const canPublish = Boolean(!publishDisabledReason && o.ceremony?.status === "DRAFT");

  return (
    <AdminCeremonyPublishScreen
      loading={o.loading}
      publishing={o.publishing}
      loadError={o.loadError}
      status={o.status}
      ceremony={o.ceremony}
      canPublish={canPublish}
      publishDisabledReason={publishDisabledReason}
      onPublish={() => {
        void o.actions.publish().then(async () => {
          // Keep wizard progression in sync after publish transitions out of DRAFT.
          await wizard?.reloadWorksheet();
        });
      }}
    />
  );
}
