import { useNavigate, useParams } from "react-router-dom";
import type { DynamicKey } from "../../../decisions/adminContent";
import { useAdminDynamicContentLedgerOrchestration } from "../../../orchestration/adminContent";
import { AdminDynamicContentLedgerScreen } from "../../../screens/admin/content/AdminDynamicContentLedgerScreen";

export function AdminDynamicContentLedgerPage() {
  const { key: keyRaw } = useParams();
  const key = keyRaw as DynamicKey | undefined;
  const navigate = useNavigate();
  const o = useAdminDynamicContentLedgerOrchestration({ key: key ?? null });

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
      onPublishDraft={(draftId) => {
        if (
          window.confirm(
            "Publish this entry? It will replace the currently published entry."
          )
        ) {
          void o.publishDraft(draftId);
        }
      }}
      onUnpublishEntry={(entryId) => {
        if (window.confirm("Unpublish this entry?")) void o.unpublishEntry(entryId);
      }}
    />
  );
}
