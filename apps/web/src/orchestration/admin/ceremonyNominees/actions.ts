import { fetchJson } from "../../../lib/api";
import type { CandidateFilm } from "./types";

type AdminFilmsListResponse = {
  films: CandidateFilm[];
  page: number;
  page_size: number;
  total: number;
};

export async function fetchAllFilms(
  query?: string
): Promise<{ ok: true; films: CandidateFilm[] } | { ok: false; error: string }> {
  const q = (query ?? "").trim();
  const firstParams = new URLSearchParams();
  firstParams.set("page", "1");
  firstParams.set("page_size", "100");
  if (q) firstParams.set("q", q);
  const firstRes = await fetchJson<AdminFilmsListResponse>(
    `/admin/films?${firstParams.toString()}`,
    { method: "GET" }
  );
  if (!firstRes.ok) {
    return { ok: false, error: firstRes.error ?? "Failed to load films" };
  }

  const firstData = firstRes.data;
  const firstFilms = firstData?.films ?? [];
  const total = Number(firstData?.total ?? firstFilms.length);
  const pageSize = Number(firstData?.page_size ?? 100) || 100;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) return { ok: true, films: firstFilms };

  const pagePromises: Array<ReturnType<typeof fetchJson<AdminFilmsListResponse>>> = [];
  for (let page = 2; page <= totalPages; page += 1) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (q) params.set("q", q);
    pagePromises.push(
      fetchJson<AdminFilmsListResponse>(`/admin/films?${params.toString()}`, {
        method: "GET"
      })
    );
  }

  const pageResults = await Promise.all(pagePromises);
  for (const res of pageResults) {
    if (!res.ok) return { ok: false, error: res.error ?? "Failed to load films" };
  }

  const restFilms = pageResults.flatMap((res) => res.data?.films ?? []);
  return { ok: true, films: [...firstFilms, ...restFilms] };
}

export async function patchFilmTmdbId(filmId: number, tmdbId: number | null) {
  return fetchJson<{ film: unknown; hydrated?: boolean }>(`/admin/films/${filmId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmdb_id: tmdbId })
  });
}

export async function patchPersonTmdbId(personId: number, tmdbId: number | null) {
  return fetchJson<{ person: unknown; hydrated?: boolean }>(`/admin/people/${personId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmdb_id: tmdbId })
  });
}

export async function postNominationContributor(
  nominationId: number,
  input: { person_id?: number; name?: string; tmdb_id?: number }
) {
  return fetchJson(`/admin/nominations/${nominationId}/contributors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function deleteNominationContributor(
  nominationId: number,
  nominationContributorId: number
) {
  return fetchJson(
    `/admin/nominations/${nominationId}/contributors/${nominationContributorId}`,
    {
      method: "DELETE"
    }
  );
}

export async function patchNominationContributorDisplay(
  nominationId: number,
  nominationContributorId: number,
  input: {
    display_name_override?: string | null;
    display_role_override?: string | null;
    avatar_person_id_override?: number | null;
  }
) {
  return fetchJson(
    `/admin/nominations/${nominationId}/contributors/${nominationContributorId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}

export async function getFilmCreditsRaw(filmId: number) {
  return fetchJson<{ credits: unknown | null }>(`/admin/films/${filmId}/credits`, {
    method: "GET"
  });
}
