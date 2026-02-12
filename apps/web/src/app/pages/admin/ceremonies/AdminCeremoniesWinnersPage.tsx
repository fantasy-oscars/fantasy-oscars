import { useParams } from "react-router-dom";
import { useAdminCeremonyWinnersOrchestration } from "@/orchestration/adminCeremonies";
import { AdminCeremoniesWinnersScreen } from "@/features/admin/screens/ceremonies/AdminCeremoniesWinnersScreen";

export function AdminCeremoniesWinnersPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  const o = useAdminCeremonyWinnersOrchestration({ ceremonyId });

  return <AdminCeremoniesWinnersScreen o={o} />;
}
