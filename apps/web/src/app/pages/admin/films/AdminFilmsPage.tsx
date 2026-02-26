import { useAdminFilmDuplicatesOrchestration } from "@/orchestration/adminFilmsDuplicates";
import { confirm } from "@/notifications";
import { AdminFilmDuplicatesScreen } from "@/features/admin/screens/films/AdminFilmDuplicatesScreen";
import { useAdminFilmsIndexOrchestration } from "@/orchestration/admin/filmsIndex/orchestration";
import { AdminFilmsIndexScreen } from "@/features/admin/screens/films/AdminFilmsIndexScreen";
import { Stack } from "@ui";

export function AdminFilmsPage() {
  const duplicates = useAdminFilmDuplicatesOrchestration();
  const films = useAdminFilmsIndexOrchestration();

  return (
    <Stack gap="lg">
      <AdminFilmsIndexScreen
        query={films.query}
        setQuery={films.setQuery}
        year={films.year}
        setYear={films.setYear}
        linked={films.linked}
        setLinked={films.setLinked}
        nominated={films.nominated}
        setNominated={films.setNominated}
        loading={films.loading}
        status={films.status}
        films={films.films}
        years={films.years}
        linkWorkingFilmId={films.linkWorkingFilmId}
        onReload={() => void films.reload()}
        onSaveTmdbId={(filmId, tmdbId) => films.setFilmTmdbId(filmId, tmdbId)}
      />

      <AdminFilmDuplicatesScreen
        compact
        query={duplicates.query}
        setQuery={duplicates.setQuery}
        loading={duplicates.loading}
        status={duplicates.status}
        groups={duplicates.groups}
        canonicalByGroup={duplicates.canonicalByGroup}
        setCanonicalForGroup={duplicates.setCanonicalForGroup}
        onReload={() => void duplicates.reload()}
        onMergeGroup={(group) => {
          const canonicalId =
            duplicates.canonicalByGroup[group.norm_title] ?? group.films[0]?.id ?? 0;
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
            void duplicates.mergeIntoCanonical(canonicalId, duplicateIds);
          });
        }}
      />
    </Stack>
  );
}
