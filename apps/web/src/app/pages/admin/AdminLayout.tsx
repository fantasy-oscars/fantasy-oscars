import { Outlet } from "react-router-dom";
import { AdminLayoutScreen } from "@/screens/admin/AdminLayoutScreen";

export function AdminLayout() {
  return (
    <AdminLayoutScreen>
      <Outlet />
    </AdminLayoutScreen>
  );
}
