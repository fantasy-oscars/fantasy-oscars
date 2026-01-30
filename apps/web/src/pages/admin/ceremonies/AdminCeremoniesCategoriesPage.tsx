import { useParams } from "react-router-dom";
import { useAdminCeremonyCategoriesOrchestration } from "../../../orchestration/adminCeremoniesCategories";
import { AdminCeremoniesCategoriesScreen } from "../../../screens/admin/ceremonies/AdminCeremoniesCategoriesScreen";
import { PageError } from "../../../ui/page-state";

export function AdminCeremoniesCategoriesPage() {
  const { ceremonyId: ceremonyIdRaw } = useParams();
  const ceremonyIdParsed = ceremonyIdRaw ? Number(ceremonyIdRaw) : NaN;
  const ceremonyId =
    Number.isFinite(ceremonyIdParsed) && ceremonyIdParsed > 0 ? ceremonyIdParsed : null;

  const o = useAdminCeremonyCategoriesOrchestration({ ceremonyId });
  if (ceremonyId === null) return <PageError message="Invalid ceremony id" />;

  return (
    <AdminCeremoniesCategoriesScreen
      ceremonyId={ceremonyId}
      o={o}
      onConfirmClone={() => {
        if (
          window.confirm(
            "Replace this ceremony's categories by cloning from the selected ceremony?"
          )
        ) {
          void o.actions.cloneCategories();
        }
      }}
      onConfirmRemoveCategory={(categoryId) => {
        if (window.confirm("Remove this category from the ceremony?")) {
          void o.actions.removeCategory(categoryId);
        }
      }}
    />
  );
}
