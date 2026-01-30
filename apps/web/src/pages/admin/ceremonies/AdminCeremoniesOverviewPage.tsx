import { useParams } from "react-router-dom";
import { useAdminCeremonyOverviewOrchestration } from "../../../orchestration/adminCeremonies";
import { AdminCeremoniesOverviewScreen } from "../../../screens/admin/ceremonies/AdminCeremoniesOverviewScreen";

export function AdminCeremoniesOverviewPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;

  const o = useAdminCeremonyOverviewOrchestration({ ceremonyId });

  return (
    <AdminCeremoniesOverviewScreen
      loading={o.loading}
      saving={o.saving}
      publishing={o.publishing}
      loadError={o.loadError}
      status={o.status}
      ceremony={o.ceremony}
      stats={o.stats}
      form={o.form}
      setForm={o.setForm}
      completeness={o.completeness}
      readOnly={o.readOnly}
      onSave={() => void o.actions.save()}
      onPublish={() => {
        if (
          window.confirm(
            "Publish this ceremony? This will make it selectable for leagues."
          )
        ) {
          void o.actions.publish();
        }
      }}
    />
  );
}
