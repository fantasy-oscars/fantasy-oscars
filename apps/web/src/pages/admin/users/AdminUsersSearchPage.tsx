import { useAdminUsersSearchOrchestration } from "../../../orchestration/adminUsers";
import { AdminUsersSearchScreen } from "../../../screens/admin/users/AdminUsersSearchScreen";

export function AdminUsersSearchPage() {
  const o = useAdminUsersSearchOrchestration();
  return (
    <AdminUsersSearchScreen
      query={o.query}
      setQuery={o.setQuery}
      searching={o.searching}
      status={o.status}
      results={o.results}
      onSearch={() => void o.search()}
    />
  );
}
