import { Outlet } from "react-router-dom";
import { useAuthContext } from "@/auth/context";
import { hasSuperAdminAccess } from "@/auth/roles";
import { AdminLayoutScreen } from "@/features/admin/screens/AdminLayoutScreen";

export function AdminLayout() {
  const { user } = useAuthContext();
  return (
    <AdminLayoutScreen isSuperAdmin={hasSuperAdminAccess(user)}>
      <Outlet />
    </AdminLayoutScreen>
  );
}
