import { confirm } from "@/notifications";
import { useAdminFilmsIndexOrchestration } from "@/orchestration/admin/filmsIndex/orchestration";
import { AdminFilmsIndexScreen } from "@/features/admin/screens/films/AdminFilmsIndexScreen";

export function AdminFilmsPage() {
  const films = useAdminFilmsIndexOrchestration();

  return (
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
      page={films.page}
      pageSize={films.pageSize}
      total={films.total}
      setPage={films.setPage}
      linkWorkingFilmId={films.linkWorkingFilmId}
      onReload={() => void films.reload()}
      onSaveTmdbId={(filmId, tmdbId) => films.setFilmTmdbId(filmId, tmdbId)}
      onLoadConsolidated={(canonicalId, page, pageSize) =>
        films.loadConsolidatedFilms(canonicalId, page, pageSize)
      }
      onDecoupleConsolidated={(canonicalId, filmId) =>
        films.decoupleConsolidatedFilm(canonicalId, filmId)
      }
      onMergeSelected={async (selectedFilms) => {
        if (selectedFilms.length < 2) return { ok: false };
        const canonical =
          selectedFilms.find((f) => Boolean(f.tmdb_id)) ??
          selectedFilms.find((f) => f.is_nominated) ??
          selectedFilms[0];
        if (!canonical) return { ok: false };
        const duplicateIds = selectedFilms
          .map((film) => film.id)
          .filter((id) => id !== canonical.id);
        if (duplicateIds.length === 0) return { ok: false };
        const ok = await confirm({
          title: "Merge selected films?",
          message:
            "This will move nominations and credits into one canonical film, then permanently delete the duplicate records.",
          confirmLabel: "Merge",
          cancelLabel: "Cancel",
          danger: true
        });
        if (!ok) return { ok: false };
        return films.mergeFilms(canonical.id, duplicateIds);
      }}
    />
  );
}
