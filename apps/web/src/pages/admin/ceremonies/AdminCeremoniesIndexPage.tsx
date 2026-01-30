import { useNavigate } from "react-router-dom";
import { useAdminCeremoniesIndexOrchestration } from "../../../orchestration/adminCeremonies";
import { AdminCeremoniesIndexScreen } from "../../../screens/admin/ceremonies/AdminCeremoniesIndexScreen";

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
          if (res.ok && res.ceremonyId)
            navigate(`/admin/ceremonies/${res.ceremonyId}/overview`);
        });
      }}
      onDelete={(id) => {
        if (window.confirm("Delete this ceremony? This cannot be undone."))
          void o.deleteCeremony(id);
      }}
    />
  );
}
