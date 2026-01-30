import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { PageLoader } from "../../../ui/page-state";
import { useAdminCeremoniesLayoutOrchestration } from "../../../orchestration/adminCeremonies";
import { AdminCeremoniesLayoutScreen } from "../../../screens/admin/ceremonies/AdminCeremoniesLayoutScreen";

export function AdminCeremoniesLayout() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const { state, error, options, hasOptions, selected } =
    useAdminCeremoniesLayoutOrchestration({ ceremonyIdRaw });
  const navigate = useNavigate();

  useEffect(() => {
    if (state !== "ready") return;
    if (!hasOptions) return;
    if (ceremonyIdRaw && !selected) {
      navigate("/admin/ceremonies", { replace: true });
    }
  }, [ceremonyIdRaw, hasOptions, navigate, selected, state]);

  if (state === "loading") return <PageLoader label="Loading ceremonies..." />;
  if (state === "error")
    return (
      <div className="status status-error">{error ?? "Unable to load ceremonies"}</div>
    );

  if (!hasOptions) return <PageLoader label="No ceremonies yet..." />;
  if (!ceremonyIdRaw || !selected) return <PageLoader label="Loading ceremony..." />;

  return (
    <AdminCeremoniesLayoutScreen
      selected={selected}
      options={options}
      onSelectCeremony={(id) => navigate(`/admin/ceremonies/${id}/overview`)}
    >
      <Outlet />
    </AdminCeremoniesLayoutScreen>
  );
}
