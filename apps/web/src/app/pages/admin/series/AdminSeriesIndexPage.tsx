import { useNavigate } from "react-router-dom";
import { useAdminSeriesIndexOrchestration } from "@/orchestration/adminSeries";
import { AdminSeriesIndexScreen } from "@/features/admin/screens/series/AdminSeriesIndexScreen";

export function AdminSeriesIndexPage() {
  const navigate = useNavigate();
  const o = useAdminSeriesIndexOrchestration();
  return (
    <AdminSeriesIndexScreen
      state={o.state}
      error={o.error}
      series={o.series}
      form={o.form}
      setForm={o.setForm}
      fieldErrors={o.fieldErrors}
      onEditField={o.clearFieldError}
      creating={o.creating}
      status={o.status}
      onCreate={() => {
        void o.actions.create().then((res) => {
          if (res.ok && res.seriesId) navigate(`/admin/series/${res.seriesId}`);
        });
      }}
    />
  );
}
