import { confirm } from "../../../notifications/confirm";
import { useAdminCategoryTemplatesOrchestration } from "../../../orchestration/adminCategoryTemplates";
import { AdminCategoryTemplatesScreen } from "../../../screens/admin/categoryTemplates/AdminCategoryTemplatesScreen";

export function AdminCategoryTemplatesPage() {
  const o = useAdminCategoryTemplatesOrchestration();

  return (
    <AdminCategoryTemplatesScreen
      o={o}
      onConfirmDelete={async (t) => {
        // Keep this plain: templates are not referenced by ceremonies after copy-on-add.
        const ok = await confirm({
          title: "Delete template?",
          message: `Delete “${t.name}”? This will not affect any existing ceremonies.`,
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          danger: true
        });
        if (!ok) return false;
        return true;
      }}
    />
  );
}
