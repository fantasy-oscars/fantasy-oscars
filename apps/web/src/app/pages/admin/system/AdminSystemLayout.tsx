import { Outlet } from "react-router-dom";
import { AdminSystemLayoutScreen } from "@/screens/admin/system/AdminSystemLayoutScreen";

export function AdminSystemLayout() {
  return (
    <AdminSystemLayoutScreen>
      <Outlet />
    </AdminSystemLayoutScreen>
  );
}
