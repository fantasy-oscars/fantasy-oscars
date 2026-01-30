import { useParams } from "react-router-dom";
import { useAdminUserDetailOrchestration } from "../../../orchestration/adminUsers";
import { AdminUserDetailScreen } from "../../../screens/admin/users/AdminUserDetailScreen";
import { PageError, PageLoader } from "../../../ui/page-state";

export function AdminUserDetailPage() {
  const { userId } = useParams();
  const idNum = userId ? Number(userId) : NaN;
  const userIdNum = Number.isFinite(idNum) ? idNum : null;
  const o = useAdminUserDetailOrchestration({ userId: userIdNum });
  if (userIdNum === null) return <PageError message="Invalid user id" />;

  if (o.loading && !o.user) return <PageLoader label="Loading user..." />;
  if (!o.user && o.status?.ok === false) return <PageError message={o.status.message} />;
  if (!o.user) return <PageError message="User not found" />;

  return (
    <AdminUserDetailScreen
      user={o.user}
      status={o.status}
      onPromote={() => {
        if (window.confirm("Promote this user to admin?")) void o.setAdmin(true);
      }}
      onDemote={() => {
        if (window.confirm("Demote this admin user?")) void o.setAdmin(false);
      }}
    />
  );
}
