import { useParams } from "react-router-dom";
import { useAdminCeremonyOverviewOrchestration } from "@/orchestration/adminCeremonies";
import { AdminCeremoniesOverviewScreen } from "@/features/admin/screens/ceremonies/AdminCeremoniesOverviewScreen";
import { useCeremonyWizardContext } from "./ceremonyWizardContext";

export function AdminCeremoniesOverviewPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;

  const wizard = useCeremonyWizardContext();
  const o = useAdminCeremonyOverviewOrchestration({ ceremonyId });

  return (
    <AdminCeremoniesOverviewScreen
      loading={o.loading}
      saving={o.saving}
      loadError={o.loadError}
      status={o.status}
      ceremony={o.ceremony}
      stats={o.stats}
      form={o.form}
      setForm={o.setForm}
      readOnly={o.readOnly}
      onSave={() => {
        void o.actions.save().then(async () => {
          // Ensure the wizard's step completion state updates immediately after saving.
          await wizard?.reloadWorksheet();
        });
      }}
    />
  );
}
