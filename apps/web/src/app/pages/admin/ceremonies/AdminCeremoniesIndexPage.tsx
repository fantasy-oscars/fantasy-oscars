import { useNavigate } from "react-router-dom";
import { useAdminCeremoniesIndexOrchestration } from "@/orchestration/adminCeremonies";
import { AdminCeremoniesIndexScreen } from "@/screens/admin/ceremonies/AdminCeremoniesIndexScreen";
import { notify } from "@/notifications";

export function AdminCeremoniesIndexPage() {
  const navigate = useNavigate();
  const o = useAdminCeremoniesIndexOrchestration();
  return (
    <AdminCeremoniesIndexScreen
      state={o.state}
      error={o.error}
      ceremonies={o.ceremonies}
      creating={o.creating}
      workingId={o.workingId}
      status={o.status}
      onCreate={() => {
        void o.createDraftCeremony().then((res) => {
          if (res.ok && res.ceremonyId) navigate(`/admin/ceremonies/${res.ceremonyId}`);
        });
      }}
      onDelete={(id) => {
        void o.deleteCeremony(id).then((res) => {
          if (res.ok) {
            notify({
              id: "admin.ceremony.delete.success",
              severity: "success",
              trigger_type: "user_action",
              scope: "local",
              durability: "ephemeral",
              requires_decision: false,
              message: "Ceremony deleted."
            });
          } else {
            notify({
              id: "admin.ceremony.delete.error",
              severity: "error",
              trigger_type: "user_action",
              scope: "local",
              durability: "ephemeral",
              requires_decision: false,
              message: res.error ?? "Delete failed."
            });
          }
        });
      }}
    />
  );
}
