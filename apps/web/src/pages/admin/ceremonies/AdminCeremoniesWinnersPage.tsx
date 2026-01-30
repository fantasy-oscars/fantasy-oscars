import { useParams } from "react-router-dom";
import { useAdminCeremonyWinnersOrchestration } from "../../../orchestration/adminCeremonies";
import { AdminCeremoniesWinnersScreen } from "../../../screens/admin/ceremonies/AdminCeremoniesWinnersScreen";

export function AdminCeremoniesWinnersPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyId = ceremonyIdRaw ? Number(ceremonyIdRaw) : null;
  const o = useAdminCeremonyWinnersOrchestration({ ceremonyId });

  return (
    <AdminCeremoniesWinnersScreen
      loading={o.loading}
      loadState={o.loadState}
      groupedNominations={o.groupedNominations}
      selectedWinner={o.selectedWinner}
      toggleNomination={o.toggleNomination}
      resetCategory={o.resetCategory}
      winnerByCategory={o.winnerByCategory}
      winnerStatus={o.winnerStatus}
      savingCategory={o.savingCategory}
      draftLock={o.draftLock}
      nominationLabel={o.nominationLabel}
      pendingWinner={o.pendingWinner}
      dismissPendingWinner={o.dismissPendingWinner}
      requestSaveWinners={o.requestSaveWinners}
      confirmPendingWinner={o.confirmPendingWinner}
    />
  );
}
