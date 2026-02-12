import { Outlet } from "react-router-dom";
import { AdminUsersLayoutScreen } from "@/screens/admin/users/AdminUsersLayoutScreen";

export function AdminUsersLayout() {
  return (
    <AdminUsersLayoutScreen>
      <Outlet />
    </AdminUsersLayoutScreen>
  );
}
