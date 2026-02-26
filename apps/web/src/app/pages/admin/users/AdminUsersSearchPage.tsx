import { useState } from "react";
import { useAdminUsersSearchOrchestration } from "@/orchestration/adminUsers";
import { AdminUsersSearchScreen } from "@/features/admin/screens/users/AdminUsersSearchScreen";
import { confirm } from "@/notifications";
import { DestructiveActionModal } from "@/shared/modals/DestructiveActionModal";
import type { AdminUserRow } from "@/orchestration/admin/users/orchestration";

export function AdminUsersSearchPage() {
  const o = useAdminUsersSearchOrchestration();
  const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUserRow | null>(null);
  const [deletePreview, setDeletePreview] = useState<{
    leagues_removed: number;
    leagues_commissioner_transferred: number;
    open_season_memberships_removed: number;
    open_season_commissioner_transferred: number;
  } | null>(null);
  const [deletePreviewError, setDeletePreviewError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  return (
    <>
      <AdminUsersSearchScreen
        query={o.query}
        setQuery={o.setQuery}
        searching={o.searching}
        status={o.status}
        results={o.results}
        onSearch={() => void o.search()}
        updatingById={o.updatingById}
        onSetRole={(user, nextRole) => {
          if (user.admin_role === "SUPER_ADMIN" && nextRole !== "SUPER_ADMIN") {
            void confirm({
              title: "Demote super admin?",
              message: "Remove super admin access for this user?",
              confirmLabel: "Demote",
              cancelLabel: "Cancel",
              danger: true
            }).then((ok) => {
              if (ok) void o.setAdminRoleForUser(user.id, nextRole);
            });
            return;
          }
          void o.setAdminRoleForUser(user.id, nextRole);
        }}
        onRemoveUser={(user) => {
          setDeleteLoading(true);
          setDeletePreviewError(null);
          setDeletePreview(null);
          setDeleteUserTarget(user);
          void o.loadDeletePreview(user.id).then((res) => {
            setDeleteLoading(false);
            if (!res.ok) {
              setDeletePreviewError(res.error);
              return;
            }
            setDeletePreview(res.preview.consequences);
          });
        }}
      />

      <DestructiveActionModal
        opened={Boolean(deleteUserTarget)}
        onClose={() => {
          if (deleteLoading) return;
          setDeleteUserTarget(null);
          setDeletePreview(null);
          setDeletePreviewError(null);
        }}
        title="Delete user?"
        summary={
          deleteUserTarget
            ? `Deleting "${deleteUserTarget.username}" disables login and applies ownership/member cleanup rules.`
            : "Delete user?"
        }
        consequences={[
          { label: "Leagues removed", value: deletePreview?.leagues_removed ?? "—" },
          {
            label: "League commissioners transferred",
            value: deletePreview?.leagues_commissioner_transferred ?? "—"
          },
          {
            label: "Open season memberships removed",
            value: deletePreview?.open_season_memberships_removed ?? "—"
          },
          {
            label: "Open season commissioners transferred",
            value: deletePreview?.open_season_commissioner_transferred ?? "—"
          }
        ]}
        confirmPhrase="DELETE"
        confirmLabel="Delete user"
        loading={deleteLoading || Boolean(deleteUserTarget && o.updatingById[deleteUserTarget.id])}
        error={deletePreviewError}
        onConfirm={async () => {
          if (!deleteUserTarget) return;
          setDeleteLoading(true);
          const res = await o.deleteUser(deleteUserTarget.id);
          setDeleteLoading(false);
          if (!res?.ok) {
            setDeletePreviewError(res?.error ?? "Failed to remove user");
            return;
          }
          setDeleteUserTarget(null);
          setDeletePreview(null);
          setDeletePreviewError(null);
        }}
      />
    </>
  );
}
