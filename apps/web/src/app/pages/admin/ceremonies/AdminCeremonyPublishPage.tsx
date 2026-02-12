import { useParams } from "react-router-dom";
import { useMemo } from "react";
import { AdminCeremonyPublishScreen } from "@/screens/admin/ceremonies/AdminCeremonyPublishScreen";
import { useAdminCeremonyOverviewOrchestration } from "@/orchestration/adminCeremonies";

export function AdminCeremonyPublishPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  const o = useAdminCeremonyOverviewOrchestration({ ceremonyId });

  const publishDisabledReason = useMemo(() => {
    const c = o.ceremony;
    const stats = o.stats;
    if (!c || !stats) return null;
    if (c.status !== "DRAFT") return null;
    if (!c.code?.trim() || !c.name?.trim()) {
      return "Add a ceremony name and code before publishing.";
    }
    if (stats.categories_total === 0)
      return "Add at least one category before publishing.";
    if (stats.categories_with_nominees !== stats.categories_total) {
      return "Each category needs at least one nominee before publishing.";
    }
    return null;
  }, [o.ceremony, o.stats]);

  const canPublish = Boolean(!publishDisabledReason && o.ceremony?.status === "DRAFT");

  return (
    <AdminCeremonyPublishScreen
      loading={o.loading}
      publishing={o.publishing}
      loadError={o.loadError}
      status={o.status}
      ceremony={o.ceremony}
      canPublish={canPublish}
      publishDisabledReason={publishDisabledReason}
      onPublish={() => o.actions.publish()}
    />
  );
}
