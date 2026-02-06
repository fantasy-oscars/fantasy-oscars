import { useNavigate, useParams } from "react-router-dom";
import type { DynamicKey } from "../../../decisions/adminContent";
import { useAdminDynamicContentEditorOrchestration } from "../../../orchestration/adminContent";
import { AdminDynamicContentEditorScreen } from "../../../screens/admin/content/AdminDynamicContentEditorScreen";
import { confirm } from "../../../notifications";
import { useLocation } from "react-router-dom";

export function AdminDynamicContentEditorPage() {
  const { key: keyRaw, id: idRaw } = useParams();
  const key = keyRaw as DynamicKey | undefined;
  const id = idRaw ? Number(idRaw) : NaN;
  const navigate = useNavigate();
  const location = useLocation();
  const contentKey = key ?? null;
  const entryId = Number.isFinite(id) ? id : null;

  const o = useAdminDynamicContentEditorOrchestration({ key: contentKey, entryId });
  const q = new URLSearchParams(location.search);
  const viewOnly = q.get("view") === "1";

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
      viewOnly={viewOnly}
      onSave={() => void o.actions.save()}
      onActivate={() => void o.actions.publish()}
      onDeactivate={() => void o.actions.unpublish()}
      onDelete={() => {
        void confirm({
          title: "Delete entry?",
          message: "Delete this entry? This cannot be undone.",
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          danger: true
        }).then((ok) => {
          if (!ok) return;
          void o.actions.deleteEntry().then((res) => {
            if (res.ok) navigate(`/admin/content/dynamic/${key}`);
          });
        });
      }}
    />
  );
}
