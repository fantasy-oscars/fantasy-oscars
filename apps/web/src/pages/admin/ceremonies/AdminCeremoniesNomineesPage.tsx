import { useParams } from "react-router-dom";
import { useAdminCeremonyNomineesOrchestration } from "../../../orchestration/adminCeremoniesNominees";
import { AdminCeremoniesNomineesScreen } from "../../../screens/admin/ceremonies/AdminCeremoniesNomineesScreen";
import { PageError } from "../../../ui/page-state";

export function AdminCeremoniesNomineesPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyIdParsed = ceremonyIdRaw ? Number(ceremonyIdRaw) : NaN;
  const ceremonyId =
    Number.isFinite(ceremonyIdParsed) && ceremonyIdParsed > 0 ? ceremonyIdParsed : null;

  const o = useAdminCeremonyNomineesOrchestration({ ceremonyId });
  if (ceremonyId === null) return <PageError message="Invalid ceremony id" />;
  return <AdminCeremoniesNomineesScreen o={o} />;
}
