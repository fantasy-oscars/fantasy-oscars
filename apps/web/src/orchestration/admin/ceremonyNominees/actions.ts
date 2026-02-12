import { fetchJson } from "../../../lib/api";

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

export async function getFilmCreditsRaw(filmId: number) {
  return fetchJson<{ credits: unknown | null }>(`/admin/films/${filmId}/credits`, {
    method: "GET"
  });
}
