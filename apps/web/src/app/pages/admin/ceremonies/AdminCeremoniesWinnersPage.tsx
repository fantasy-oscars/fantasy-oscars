import { useParams } from "react-router-dom";
import { useAdminCeremonyWinnersOrchestration } from "@/orchestration/adminCeremonies";
import { AdminCeremoniesWinnersScreen } from "@/features/admin/screens/ceremonies/AdminCeremoniesWinnersScreen";
import { useCeremonyWizardContext } from "./ceremonyWizardContext";

export function AdminCeremoniesWinnersPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  const wizard = useCeremonyWizardContext();
  const o = useAdminCeremonyWinnersOrchestration({
    ceremonyId,
    onAfterFinalize: () => wizard?.reloadWorksheet()
  });

  return <AdminCeremoniesWinnersScreen o={o} />;
}
