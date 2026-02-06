import { Outlet, useParams } from "react-router-dom";
import { Box } from "@mantine/core";

export function AdminCeremoniesLayout() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  if (!ceremonyId || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
    return <Box className="status status-error">Invalid ceremony id</Box>;
  }
  return <Outlet />;
}
