import { AdminHomeScreen } from "@/features/admin/screens/AdminHomeScreen";
import { useAuthContext } from "@/auth/context";
import { hasSuperAdminAccess } from "@/auth/roles";

export function AdminHomePage() {
  const { user } = useAuthContext();
  return <AdminHomeScreen isSuperAdmin={hasSuperAdminAccess(user)} />;
}
