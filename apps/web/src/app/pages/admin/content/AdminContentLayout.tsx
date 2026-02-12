import { Outlet } from "react-router-dom";
import { AdminContentLayoutScreen } from "@/features/admin/screens/content/AdminContentLayoutScreen";

export function AdminContentLayout() {
  return (
    <AdminContentLayoutScreen>
      <Outlet />
    </AdminContentLayoutScreen>
  );
}
