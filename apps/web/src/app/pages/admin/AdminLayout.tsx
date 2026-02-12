import { Outlet } from "react-router-dom";
import { AdminLayoutScreen } from "@/features/admin/screens/AdminLayoutScreen";

export function AdminLayout() {
  return (
    <AdminLayoutScreen>
      <Outlet />
    </AdminLayoutScreen>
  );
}
