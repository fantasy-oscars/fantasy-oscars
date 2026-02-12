import { Outlet, useParams } from "react-router-dom";
import { PageError } from "@/shared/page-state";

export function AdminCeremoniesLayout() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  if (!ceremonyId || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
    return <PageError message="Invalid ceremony id" />;
  }
  return <Outlet />;
}
