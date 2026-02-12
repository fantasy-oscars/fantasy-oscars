import { useParams } from "react-router-dom";
import type { StaticKey } from "@/decisions/adminContent";
import { useAdminStaticContentEditorOrchestration } from "@/orchestration/adminContent";
import { AdminStaticContentEditorScreen } from "@/screens/admin/content/AdminStaticContentEditorScreen";

export function AdminStaticContentEditorPage() {
  const { key: keyRaw } = useParams();
  const key = keyRaw as StaticKey | undefined;
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
