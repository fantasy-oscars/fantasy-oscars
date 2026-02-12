import { Navigate, useParams } from "react-router-dom";
import { PageError } from "@/shared/page-state";

export function AdminCeremonyPreviewPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyIdParsed = ceremonyIdRaw ? Number(ceremonyIdRaw) : NaN;
  const ceremonyId =
    Number.isFinite(ceremonyIdParsed) && ceremonyIdParsed > 0 ? ceremonyIdParsed : null;

  if (!ceremonyId) return <PageError message="Invalid ceremony id" />;
  return <Navigate to={`/drafts/preview/ceremonies/${ceremonyId}`} replace />;
}
