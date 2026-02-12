import { Outlet } from "react-router-dom";
import { AdminUsersLayoutScreen } from "@/features/admin/screens/users/AdminUsersLayoutScreen";

export function AdminUsersLayout() {
  return (
    <AdminUsersLayoutScreen>
      <Outlet />
    </AdminUsersLayoutScreen>
  );
}
