import { useParams } from "react-router-dom";
import { useAdminCeremonyLockOrchestration } from "@/orchestration/adminCeremonies";
import { AdminCeremoniesLockScreen } from "@/screens/admin/ceremonies/AdminCeremoniesLockScreen";
import { confirm } from "@/notifications";

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
        void confirm({
          title: "Lock ceremony?",
          message: "Lock this ceremony? This will cancel any in-progress drafts.",
          confirmLabel: "Lock",
          cancelLabel: "Cancel",
          danger: true
        }).then((ok) => {
          if (ok) void o.actions.lock();
        });
      }}
      onArchive={() => {
        void confirm({
          title: "Archive ceremony?",
          message:
            "Archive this ceremony? It will no longer show as active, but data remains viewable.",
          confirmLabel: "Archive",
          cancelLabel: "Cancel"
        }).then((ok) => {
          if (ok) void o.actions.archive();
        });
      }}
    />
  );
}
