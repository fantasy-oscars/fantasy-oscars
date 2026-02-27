import { useParams } from "react-router-dom";
import { useAdminCeremonyLockOrchestration } from "@/orchestration/adminCeremonies";
import { AdminCeremoniesLockScreen } from "@/features/admin/screens/ceremonies/AdminCeremoniesLockScreen";
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
      onArchive={() => {
        if (o.lockState?.status !== "COMPLETE") return;
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
