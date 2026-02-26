import { AdminContentHomeScreen } from "@/features/admin/screens/content/AdminContentHomeScreen";
import { useAuthContext } from "@/auth/context";
import { hasSuperAdminAccess } from "@/auth/roles";

export function AdminContentHomePage() {
  const { user } = useAuthContext();
  return <AdminContentHomeScreen isSuperAdmin={hasSuperAdminAccess(user)} />;
}
