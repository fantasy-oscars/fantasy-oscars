import { queryOptions } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import type {
  CeremonySummary,
  InboxInvite,
  LeagueDetail,
  LeagueMember,
  LeagueSummary,
  SeasonMeta,
  SeasonSummary
} from "../../lib/types";
import { queryKeys } from "./keys";
import { ApiQueryError, unwrap } from "./errors";

/** Shared by every surface that needs the signed-in user's leagues. */
export function leaguesListQuery() {
  return queryOptions({
    queryKey: queryKeys.leagues.list(),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<{ leagues: LeagueSummary[] }>("/leagues", { method: "GET" }),
        "Failed to load leagues"
      );
      return data?.leagues ?? [];
    }
  });
}

/** Shared by the ceremonies index, season index and season detail. */
export function ceremoniesListQuery() {
  return queryOptions({
    queryKey: queryKeys.ceremonies.list(),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<{ ceremonies: CeremonySummary[] }>("/ceremonies", {
          method: "GET"
        }),
        "Failed to load ceremonies"
      );
      return data?.ceremonies ?? [];
    }
  });
}

export function leagueQuery(leagueId: number) {
  return queryOptions({
    queryKey: queryKeys.leagues.one(leagueId),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<{ league: LeagueDetail }>(`/leagues/${leagueId}`, {
          method: "GET"
        }),
        "Unable to load league"
      );
      if (!data?.league) throw new ApiQueryError("Unable to load league");
      return data.league;
    }
  });
}

export type LeagueSeasonRow = SeasonSummary & SeasonMeta;

export function leagueSeasonsQuery(leagueId: number) {
  return queryOptions({
    queryKey: queryKeys.leagues.seasons(leagueId),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<{ seasons: LeagueSeasonRow[] }>(`/leagues/${leagueId}/seasons`, {
          method: "GET"
        }),
        "Unable to load seasons"
      );
      return data?.seasons ?? [];
    }
  });
}

/** Shared by the chrome bell and the invites inbox page. */
export function invitesInboxQuery() {
  return queryOptions({
    queryKey: queryKeys.invites.inbox(),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<{ invites: InboxInvite[] }>("/seasons/invites/inbox", {
          method: "GET"
        }),
        "Could not load invites"
      );
      // Defensive: treat null/invalid rows as already-resolved invites and hide them.
      return Array.isArray(data?.invites)
        ? (data.invites as unknown[]).filter(
            (i): i is InboxInvite =>
              Boolean(i) &&
              typeof (i as { id?: unknown }).id === "number" &&
              Number.isFinite((i as { id: number }).id) &&
              (i as { id: number }).id > 0
          )
        : [];
    }
  });
}

export function leagueMembersQuery(leagueId: number) {
  return queryOptions({
    queryKey: queryKeys.leagues.members(leagueId),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<{ members: LeagueMember[] }>(`/leagues/${leagueId}/members`, {
          method: "GET"
        }),
        "Unable to load members"
      );
      return data?.members ?? [];
    }
  });
}
