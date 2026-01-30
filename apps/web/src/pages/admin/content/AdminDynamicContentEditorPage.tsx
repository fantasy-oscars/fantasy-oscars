import { useNavigate, useParams } from "react-router-dom";
import type { DynamicKey } from "../../../decisions/adminContent";
import { useAdminDynamicContentEditorOrchestration } from "../../../orchestration/adminContent";
import { AdminDynamicContentEditorScreen } from "../../../screens/admin/content/AdminDynamicContentEditorScreen";

export function AdminDynamicContentEditorPage() {
  const { key: keyRaw, id: idRaw } = useParams();
  const key = keyRaw as DynamicKey | undefined;
  const id = idRaw ? Number(idRaw) : NaN;
  const navigate = useNavigate();
  const contentKey = key ?? null;
  const entryId = Number.isFinite(id) ? id : null;

  const o = useAdminDynamicContentEditorOrchestration({ key: contentKey, entryId });

  return (
    <AdminDynamicContentEditorScreen
      contentKey={contentKey}
      meta={o.meta ? { label: o.meta.label } : null}
      entryId={entryId}
      loading={o.loading}
      busy={o.busy}
      status={o.status}
      entry={o.entry}
      fields={o.fields}
      onSave={() => void o.actions.save()}
      onPublish={() => {
        if (
          window.confirm(
            "Publish this entry? It will replace the currently published entry."
          )
        ) {
          void o.actions.publish();
        }
      }}
      onUnpublish={() => {
        if (window.confirm("Unpublish this entry?")) void o.actions.unpublish();
      }}
      onDelete={() => {
        if (window.confirm("Delete this draft? This cannot be undone.")) {
          void o.actions.deleteEntry().then((res) => {
            if (res.ok) navigate(`/admin/content/dynamic/${key}`);
          });
        }
      }}
    />
  );
}
