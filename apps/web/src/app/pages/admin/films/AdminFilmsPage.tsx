import { useAdminFilmDuplicatesOrchestration } from "@/orchestration/adminFilmsDuplicates";
import { confirm } from "@/notifications";
import { AdminFilmDuplicatesScreen } from "@/features/admin/screens/films/AdminFilmDuplicatesScreen";

export function AdminFilmsPage() {
  const o = useAdminFilmDuplicatesOrchestration();

  return (
    <AdminFilmDuplicatesScreen
      query={o.query}
      setQuery={o.setQuery}
      loading={o.loading}
      status={o.status}
      groups={o.groups}
      canonicalByGroup={o.canonicalByGroup}
      setCanonicalForGroup={o.setCanonicalForGroup}
      onReload={() => void o.reload()}
      onMergeGroup={(group) => {
        const canonicalId =
          o.canonicalByGroup[group.norm_title] ?? group.films[0]?.id ?? 0;
        if (!canonicalId) return;
        const duplicateIds = group.films
          .map((f) => f.id)
          .filter((id) => id !== canonicalId);
        if (duplicateIds.length === 0) return;

        void confirm({
          title: "Merge duplicate films?",
          message:
            "This will move nominations/credits from the duplicates to the selected canonical film and permanently delete the duplicate records.",
          confirmLabel: "Merge",
          cancelLabel: "Cancel",
          danger: true
        }).then((ok) => {
          if (!ok) return;
          void o.mergeIntoCanonical(canonicalId, duplicateIds);
        });
      }}
    />
  );
}
