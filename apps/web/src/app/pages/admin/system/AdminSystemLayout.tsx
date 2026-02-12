import { Outlet } from "react-router-dom";
import { AdminSystemLayoutScreen } from "@/features/admin/screens/system/AdminSystemLayoutScreen";

export function AdminSystemLayout() {
  return (
    <AdminSystemLayoutScreen>
      <Outlet />
    </AdminSystemLayoutScreen>
  );
}
