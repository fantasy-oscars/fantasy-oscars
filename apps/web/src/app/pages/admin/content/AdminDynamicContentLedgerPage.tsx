import { useNavigate, useParams } from "react-router-dom";
import { canEditDynamicContentByRole, type DynamicKey } from "@/decisions/adminContent";
import { useAdminDynamicContentLedgerOrchestration } from "@/orchestration/adminContent";
import { AdminDynamicContentLedgerScreen } from "@/features/admin/screens/content/AdminDynamicContentLedgerScreen";
import { useAuthContext } from "@/auth/context";
import { normalizeAdminRole } from "@/auth/roles";
import { PageError } from "@/shared/page-state";

export function AdminDynamicContentLedgerPage() {
  const { key: keyRaw } = useParams();
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const key = keyRaw as DynamicKey | undefined;
  const role = normalizeAdminRole(user?.admin_role, Boolean(user?.is_admin));
  const forbidden = Boolean(key && !canEditDynamicContentByRole({ role, key }));
  const o = useAdminDynamicContentLedgerOrchestration({ key: key ?? null });
  if (forbidden) {
    return <PageError message="Super admin access required for this content." />;
  }

  return (
    <AdminDynamicContentLedgerScreen
      contentKey={key ?? null}
      meta={o.meta}
      loading={o.loading}
      busy={o.busy}
      status={o.status}
      entries={o.entries}
      onCreateEntry={() => {
        void o.createEntry().then((res) => {
          if (res.ok && res.draftId)
            navigate(`/admin/content/dynamic/${key}/drafts/${res.draftId}`);
        });
      }}
      onPublishDraft={(draftId) => void o.publishDraft(draftId)}
      onUnpublishEntry={(entryId) => void o.unpublishEntry(entryId)}
    />
  );
}
