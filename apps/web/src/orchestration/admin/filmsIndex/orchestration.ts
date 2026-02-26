import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../../lib/api";
import { notify } from "../../../notifications/notify";

export type AdminFilmRow = {
  id: number;
  title: string;
  release_year: number | null;
  tmdb_id: number | null;
  poster_url: string | null;
  is_nominated: boolean;
  is_consolidated: boolean;
  norm_title: string;
  duplicate_count: number;
};

export type ConsolidatedFilmRow = {
  id: number;
  title: string;
  release_year: number | null;
  tmdb_id: number | null;
  poster_url: string | null;
  is_nominated: boolean;
};

export type TmdbFilmSearchResult = {
  tmdb_id: number;
  title: string;
  original_title: string | null;
  release_year: number | null;
  poster_url: string | null;
  director: string | null;
  overview: string | null;
  linked_film_id: number | null;
  linked_film_title: string | null;
};

type ListParams = {
  query: string;
  year: string;
  linked: "all" | "linked" | "unlinked";
  nominated: "all" | "nominated" | "not_nominated";
  page: number;
};

export function useAdminFilmsIndexOrchestration() {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");
  const [linked, setLinked] = useState<"all" | "linked" | "unlinked">("all");
  const [nominated, setNominated] = useState<"all" | "nominated" | "not_nominated">(
    "all"
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<
    { ok: true } | { ok: false; message: string } | null
  >(null);
  const [films, setFilms] = useState<AdminFilmRow[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [linkWorkingFilmId, setLinkWorkingFilmId] = useState<number | null>(null);

  const buildPath = useCallback(
    (params: ListParams) => {
      const search = new URLSearchParams();
      if (params.query.trim()) search.set("q", params.query.trim());
      if (params.year !== "all") search.set("year", params.year);
      if (params.linked !== "all") search.set("linked", params.linked);
      if (params.nominated !== "all") search.set("nominated", params.nominated);
      search.set("page", String(params.page));
      search.set("page_size", String(pageSize));
      const qs = search.toString();
      return qs ? `/admin/films?${qs}` : "/admin/films";
    },
    [pageSize]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<{
      films: AdminFilmRow[];
      years?: number[];
      page?: number;
      page_size?: number;
      total?: number;
    }>(buildPath({ query, year, linked, nominated, page }), { method: "GET" });
    setLoading(false);
    if (!res.ok) {
      setFilms([]);
      setTotal(0);
      setStatus({ ok: false, message: res.error ?? "Failed to load films" });
      return;
    }
    setFilms(res.data?.films ?? []);
    setYears(
      (res.data?.years ?? [])
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v))
        .sort((a, b) => b - a)
    );
    setPage(Number(res.data?.page ?? page));
    setPageSize(Number(res.data?.page_size ?? pageSize));
    setTotal(Number(res.data?.total ?? 0));
    setStatus({ ok: true });
  }, [buildPath, linked, nominated, page, pageSize, query, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilmTmdbId = useCallback(
    async (filmId: number, tmdbId: number | null) => {
      setLinkWorkingFilmId(filmId);
      const res = await fetchJson<{ hydrated?: boolean }>(`/admin/films/${filmId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_id: tmdbId })
      });
      setLinkWorkingFilmId(null);
      if (!res.ok) {
        notify({
          id: `admin_films_link_error_${filmId}`,
          severity: "error",
          trigger_type: "user_action",
          scope: "local",
          durability: "ephemeral",
          requires_decision: false,
          title: tmdbId ? "Could not link film" : "Could not unlink film",
          message: res.error ?? "Request failed."
        });
        return { ok: false as const, error: res.error ?? "Request failed." };
      }

      notify({
        id: `admin_films_link_ok_${filmId}`,
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        title: tmdbId ? "Film linked" : "Film unlinked",
        message: tmdbId
          ? res.data?.hydrated
            ? "Hydrated details from TMDB."
            : "Linked."
          : "Link removed."
      });
      await load();
      return { ok: true as const };
    },
    [load]
  );

  const mergeFilms = useCallback(
    async (canonicalId: number, duplicateIds: number[]) => {
      const res = await fetchJson(`/admin/films/${canonicalId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicate_ids: duplicateIds })
      });
      if (!res.ok) {
        notify({
          id: `admin_films_merge_error_${canonicalId}`,
          severity: "error",
          trigger_type: "user_action",
          scope: "local",
          durability: "ephemeral",
          requires_decision: false,
          title: "Merge failed",
          message: res.error ?? "Unable to merge films."
        });
        return {
          ok: false as const,
          error: res.error ?? "Unable to merge films.",
          errorCode: res.errorCode,
          errorDetails: res.errorDetails
        };
      }
      notify({
        id: `admin_films_merge_ok_${canonicalId}`,
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        title: "Merge complete",
        message: "Selected films were merged."
      });
      await load();
      return { ok: true as const };
    },
    [load]
  );

  const loadConsolidatedFilms = useCallback(
    async (canonicalId: number, page = 1, pageSize = 8) => {
      const res = await fetchJson<{
        films: ConsolidatedFilmRow[];
        total: number;
        page: number;
        page_size: number;
      }>(
        `/admin/films/${canonicalId}/consolidated?page=${encodeURIComponent(String(page))}&page_size=${encodeURIComponent(String(pageSize))}`,
        { method: "GET" }
      );
      if (!res.ok) {
        return {
          ok: false as const,
          error: res.error ?? "Failed to load consolidated films."
        };
      }
      return {
        ok: true as const,
        films: res.data?.films ?? [],
        total: Number(res.data?.total ?? 0),
        page: Number(res.data?.page ?? page),
        pageSize: Number(res.data?.page_size ?? pageSize)
      };
    },
    []
  );

  const decoupleConsolidatedFilm = useCallback(
    async (canonicalId: number, filmId: number) => {
      const res = await fetchJson(
        `/admin/films/${canonicalId}/consolidated/${filmId}/decouple`,
        { method: "POST" }
      );
      if (!res.ok) {
        notify({
          id: `admin_films_decouple_error_${filmId}`,
          severity: "error",
          trigger_type: "user_action",
          scope: "local",
          durability: "ephemeral",
          requires_decision: false,
          title: "Could not decouple film",
          message: res.error ?? "Request failed."
        });
        return { ok: false as const, error: res.error ?? "Request failed." };
      }
      notify({
        id: `admin_films_decouple_ok_${filmId}`,
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        title: "Film decoupled",
        message: "The film is no longer consolidated."
      });
      await load();
      return { ok: true as const };
    },
    [load]
  );

  const searchTmdbFilmCandidates = useCallback(async (q: string) => {
    const queryTrimmed = q.trim();
    if (queryTrimmed.length < 2) return { ok: true as const, results: [] };
    const res = await fetchJson<{ results: TmdbFilmSearchResult[] }>(
      `/admin/films/tmdb-search?q=${encodeURIComponent(queryTrimmed)}`,
      { method: "GET" }
    );
    if (!res.ok) {
      return {
        ok: false as const,
        error: res.error ?? "Failed to search TMDB."
      };
    }
    return { ok: true as const, results: res.data?.results ?? [] };
  }, []);

  return useMemo(
    () => ({
      query,
      setQuery: (next: string) => {
        setPage(1);
        setQuery(next);
      },
      year,
      setYear: (next: string) => {
        setPage(1);
        setYear(next);
      },
      linked,
      setLinked: (next: "all" | "linked" | "unlinked") => {
        setPage(1);
        setLinked(next);
      },
      nominated,
      setNominated: (next: "all" | "nominated" | "not_nominated") => {
        setPage(1);
        setNominated(next);
      },
      page,
      pageSize,
      total,
      setPage,
      loading,
      status,
      films,
      years,
      linkWorkingFilmId,
      reload: load,
      setFilmTmdbId,
      mergeFilms,
      loadConsolidatedFilms,
      decoupleConsolidatedFilm,
      searchTmdbFilmCandidates
    }),
    [
      query,
      year,
      linked,
      nominated,
      loading,
      status,
      films,
      years,
      linkWorkingFilmId,
      page,
      pageSize,
      total,
      load,
      setFilmTmdbId,
      mergeFilms,
      loadConsolidatedFilms,
      decoupleConsolidatedFilm,
      searchTmdbFilmCandidates
    ]
  );
}
