import { Outlet } from "react-router-dom";
import { AdminContentLayoutScreen } from "../../../screens/admin/content/AdminContentLayoutScreen";

export function AdminContentLayout() {
  return (
    <AdminContentLayoutScreen>
      <Outlet />
    </AdminContentLayoutScreen>
  );
}
