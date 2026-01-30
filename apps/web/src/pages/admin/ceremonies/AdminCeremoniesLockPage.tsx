import { useParams } from "react-router-dom";
import { useAdminCeremonyLockOrchestration } from "../../../orchestration/adminCeremonies";
import { AdminCeremoniesLockScreen } from "../../../screens/admin/ceremonies/AdminCeremoniesLockScreen";

export function AdminCeremoniesLockPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  const o = useAdminCeremonyLockOrchestration({ ceremonyId });

  return (
    <AdminCeremoniesLockScreen
      loading={o.loading}
      saving={o.saving}
      lockState={o.lockState}
      status={o.status}
      onLock={() => {
        if (
          window.confirm("Lock this ceremony? This will cancel any in-progress drafts.")
        ) {
          void o.actions.lock();
        }
      }}
      onArchive={() => {
        if (
          window.confirm(
            "Archive this ceremony? It will no longer show as active, but data remains viewable."
          )
        ) {
          void o.actions.archive();
        }
      }}
    />
  );
}
