import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  announcementTypeForKey,
  homeAnnouncementToReplace,
  parseAnnouncementFilter
} from "@/decisions/adminContent";
import { useAdminAnnouncementsOrchestration } from "@/orchestration/adminContent";
import { AdminAnnouncementsScreen } from "@/features/admin/screens/content/AdminAnnouncementsScreen";
import { confirmHomeReplacement } from "./confirmHomeReplacement";

export function AdminAnnouncementsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filter = parseAnnouncementFilter(params.get("type"));
  const o = useAdminAnnouncementsOrchestration();

  return (
    <AdminAnnouncementsScreen
      loading={o.loading}
      busy={o.busy}
      status={o.status}
      entries={o.entries}
      filter={filter}
      onFilterChange={(next) =>
        setParams(next === "all" ? {} : { type: next }, { replace: true })
      }
      onCreate={(type) => {
        void o.createEntry(type).then((res) => {
          if (res.ok && res.draftId)
            navigate(`/admin/content/dynamic/${res.key}/drafts/${res.draftId}`);
        });
      }}
      onPublish={(entry) => {
        const replaced = homeAnnouncementToReplace(o.entries, entry.id);
        void confirmHomeReplacement(replaced).then((ok) => {
          if (ok) void o.publishEntry(entry);
        });
      }}
      onUnpublish={(entry) => void o.unpublishEntry(entry)}
    />
  );
}

/** Old per-key ledger URLs land on the consolidated list, filtered to that type. */
export function AdminAnnouncementsKeyRedirect() {
  const { key } = useParams();
  const type = key ? announcementTypeForKey(key) : null;
  return (
    <Navigate to={type ? `/admin/content?type=${type}` : "/admin/content"} replace />
  );
}
