import { useParams } from "react-router-dom";
import { useAdminSeriesDetailOrchestration } from "@/orchestration/adminSeries";
import { AdminSeriesDetailScreen } from "@/features/admin/screens/series/AdminSeriesDetailScreen";

export function AdminSeriesDetailPage() {
  const { seriesId: seriesIdRaw } = useParams();
  const parsed = seriesIdRaw ? Number(seriesIdRaw) : NaN;
  const seriesId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const o = useAdminSeriesDetailOrchestration({ seriesId });
  return (
    <AdminSeriesDetailScreen
      state={o.state}
      error={o.error}
      detail={o.detail}
      ceremonies={o.ceremonies}
      working={o.working}
      status={o.status}
      activationMissing={o.activationMissing}
      onAssociate={o.actions.associate}
      onRemove={(ceremonyId) => void o.actions.remove(ceremonyId)}
      onSetMapping={(editionId, categoryId) =>
        void o.actions.setMapping(editionId, categoryId)
      }
      onActivate={() => void o.actions.activate()}
    />
  );
}
