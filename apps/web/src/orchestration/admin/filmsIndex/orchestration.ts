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
};

type ListParams = {
  query: string;
  year: string;
  linked: "all" | "linked" | "unlinked";
  nominated: "all" | "nominated" | "not_nominated";
};

export function useAdminFilmsIndexOrchestration() {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");
  const [linked, setLinked] = useState<"all" | "linked" | "unlinked">("all");
  const [nominated, setNominated] = useState<"all" | "nominated" | "not_nominated">("all");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<
    { ok: true } | { ok: false; message: string } | null
  >(null);
  const [films, setFilms] = useState<AdminFilmRow[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [linkWorkingFilmId, setLinkWorkingFilmId] = useState<number | null>(null);

  const buildPath = useCallback((params: ListParams) => {
    const search = new URLSearchParams();
    if (params.query.trim()) search.set("q", params.query.trim());
    if (params.year !== "all") search.set("year", params.year);
    if (params.linked !== "all") search.set("linked", params.linked);
    if (params.nominated !== "all") search.set("nominated", params.nominated);
    const qs = search.toString();
    return qs ? `/admin/films?${qs}` : "/admin/films";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<{ films: AdminFilmRow[]; years?: number[] }>(
      buildPath({ query, year, linked, nominated }),
      { method: "GET" }
    );
    setLoading(false);
    if (!res.ok) {
      setFilms([]);
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
    setStatus({ ok: true });
  }, [buildPath, linked, nominated, query, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilmTmdbId = useCallback(async (filmId: number, tmdbId: number | null) => {
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
        ? (res.data?.hydrated ? "Hydrated details from TMDB." : "Linked.")
        : "Link removed."
    });
    await load();
    return { ok: true as const };
  }, [load]);

  return useMemo(
    () => ({
      query,
      setQuery,
      year,
      setYear,
      linked,
      setLinked,
      nominated,
      setNominated,
      loading,
      status,
      films,
      years,
      linkWorkingFilmId,
      reload: load,
      setFilmTmdbId
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
      load,
      setFilmTmdbId
    ]
  );
}
