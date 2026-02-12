import { useAdminUsersSearchOrchestration } from "@/orchestration/adminUsers";
import { AdminUsersSearchScreen } from "@/features/admin/screens/users/AdminUsersSearchScreen";
import { confirm } from "@/notifications";

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
      updatingById={o.updatingById}
      onSetAdmin={(user, nextIsAdmin) => {
        if (user.is_admin && !nextIsAdmin) {
          void confirm({
            title: "Demote admin?",
            message: "Remove admin access for this user?",
            confirmLabel: "Demote",
            cancelLabel: "Cancel",
            danger: true
          }).then((ok) => {
            if (ok) void o.setAdminForUser(user.id, nextIsAdmin);
          });
          return;
        }
        void o.setAdminForUser(user.id, nextIsAdmin);
      }}
    />
  );
}
