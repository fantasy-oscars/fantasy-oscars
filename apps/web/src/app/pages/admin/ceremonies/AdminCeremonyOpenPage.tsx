import { useParams } from "react-router-dom";
import { useMemo } from "react";
import { AdminCeremonyOpenScreen } from "@/features/admin/screens/ceremonies/AdminCeremonyOpenScreen";
import { useAdminCeremonyOverviewOrchestration } from "@/orchestration/adminCeremonies";
import { useCeremonyWizardContext } from "./ceremonyWizardContext";

export function AdminCeremonyOpenPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  const wizard = useCeremonyWizardContext();
  const o = useAdminCeremonyOverviewOrchestration({ ceremonyId });

  const openDisabledReason = useMemo(() => {
    const c = o.ceremony;
    if (!c) return null;
    if (c.status === "DRAFT")
      return "Publish the ceremony before opening it for leagues.";
    if (c.status !== "PUBLISHED") return null;
    if (!o.completeness.ok) {
      return `Every category needs at least one nominee first (${o.completeness.label}).`;
    }
    return null;
  }, [o.ceremony, o.completeness]);

  const canOpen = Boolean(!openDisabledReason && o.ceremony?.status === "PUBLISHED");

  return (
    <AdminCeremonyOpenScreen
      loading={o.loading}
      opening={o.opening}
      loadError={o.loadError}
      status={o.status}
      ceremony={o.ceremony}
      canOpen={canOpen}
      openDisabledReason={openDisabledReason}
      onOpen={() => {
        void o.actions.openForLeagues().then(async () => {
          // Keep wizard progression in sync after the ceremony leaves PUBLISHED.
          await wizard?.reloadWorksheet();
        });
      }}
    />
  );
}
