import { useParams } from "react-router-dom";
import { useAdminCeremonyCategoriesOrchestration } from "@/orchestration/adminCeremoniesCategories";
import { AdminCeremoniesCategoriesScreen } from "@/features/admin/screens/ceremonies/AdminCeremoniesCategoriesScreen";
import { PageError } from "@/shared/page-state";
import { useCeremonyWizardContext } from "./ceremonyWizardContext";

export function AdminCeremoniesCategoriesPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyIdParsed = ceremonyIdRaw ? Number(ceremonyIdRaw) : NaN;
  const ceremonyId =
    Number.isFinite(ceremonyIdParsed) && ceremonyIdParsed > 0 ? ceremonyIdParsed : null;

  const wizard = useCeremonyWizardContext();
  const o = useAdminCeremonyCategoriesOrchestration({ ceremonyId });
  if (ceremonyId === null) return <PageError message="Invalid ceremony id" />;

  return (
    <AdminCeremoniesCategoriesScreen
      ceremonyId={ceremonyId}
      o={o}
      onAfterChange={async () => {
        await wizard?.reloadWorksheet();
      }}
      onConfirmClone={async () => {
        const ok = await o.actions.cloneCategories();
        if (ok) await wizard?.reloadWorksheet();
        return ok;
      }}
      onConfirmRemoveCategory={async (categoryId) => {
        const ok = await o.actions.removeCategory(categoryId);
        if (ok) await wizard?.reloadWorksheet();
        return ok;
      }}
    />
  );
}
