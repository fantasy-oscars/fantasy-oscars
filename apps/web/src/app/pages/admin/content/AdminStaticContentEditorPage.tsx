import { useParams } from "react-router-dom";
import {
  canEditStaticContentByRole,
  type StaticKey
} from "@/decisions/adminContent";
import { useAdminStaticContentEditorOrchestration } from "@/orchestration/adminContent";
import { AdminStaticContentEditorScreen } from "@/features/admin/screens/content/AdminStaticContentEditorScreen";
import { useAuthContext } from "@/auth/context";
import { normalizeAdminRole } from "@/auth/roles";
import { PageError } from "@/shared/page-state";

export function AdminStaticContentEditorPage() {
  const { key: keyRaw } = useParams();
  const { user } = useAuthContext();
  const key = keyRaw as StaticKey | undefined;
  const role = normalizeAdminRole(user?.admin_role, Boolean(user?.is_admin));
  if (key && !canEditStaticContentByRole({ role, key })) {
    return <PageError message="Super admin access required for this content." />;
  }
  const o = useAdminStaticContentEditorOrchestration({ key: key ?? null });
  return (
    <AdminStaticContentEditorScreen
      contentKey={key ?? null}
      meta={o.meta}
      loading={o.loading}
      saving={o.saving}
      loadError={o.loadError}
      status={o.status}
      title={o.title}
      setTitle={o.setTitle}
      body={o.body}
      setBody={o.setBody}
      onSave={() => void o.save()}
    />
  );
}
