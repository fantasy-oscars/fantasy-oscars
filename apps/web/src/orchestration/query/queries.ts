import { queryOptions } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import type {
  CeremonySummary,
  CircuitDraftSnapshot,
  CircuitLeagueDetail,
  CircuitLeagueSummary,
  CircuitQueue,
  CircuitRoster,
  CircuitSummary,
  CircuitTransaction,
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

/** A league's Circuit competitions, listed beside its Seasons. */
export function leagueCircuitsQuery(leagueId: number) {
  return queryOptions({
    queryKey: queryKeys.leagues.circuits(leagueId),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<{ circuit_leagues: CircuitLeagueSummary[] }>(
          `/leagues/${leagueId}/circuits`,
          { method: "GET" }
        ),
        "Unable to load seasons"
      );
      return data?.circuit_leagues ?? [];
    }
  });
}

/** Public Circuits a commissioner can start in a league. */
export function circuitsListQuery() {
  return queryOptions({
    queryKey: queryKeys.circuits.list(),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<{ circuits: CircuitSummary[] }>("/circuits", { method: "GET" }),
        "Unable to load seasons"
      );
      return data?.circuits ?? [];
    }
  });
}

export function circuitLeagueQuery(circuitLeagueId: number) {
  return queryOptions({
    queryKey: queryKeys.circuitLeagues.detail(circuitLeagueId),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<CircuitLeagueDetail>(`/circuit-leagues/${circuitLeagueId}`, {
          method: "GET"
        }),
        "Unable to load season"
      );
      if (!data) throw new ApiQueryError("Unable to load season");
      return data;
    }
  });
}

/** A member's roster in a league's season; `userId` null reads the viewer's own. */
export function circuitRosterQuery(circuitLeagueId: number, userId: number | null) {
  return queryOptions({
    queryKey: queryKeys.circuitLeagues.roster(circuitLeagueId, userId),
    queryFn: async () => {
      const path =
        userId === null
          ? `/circuit-leagues/${circuitLeagueId}/roster`
          : `/circuit-leagues/${circuitLeagueId}/members/${userId}/roster`;
      const data = unwrap(
        await fetchJson<CircuitRoster>(path, { method: "GET" }),
        "Unable to load roster"
      );
      if (!data) throw new ApiQueryError("Unable to load roster");
      return data;
    }
  });
}

export function circuitTransactionsQuery(circuitLeagueId: number) {
  return queryOptions({
    queryKey: queryKeys.circuitLeagues.transactions(circuitLeagueId),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<{ transactions: CircuitTransaction[] }>(
          `/circuit-leagues/${circuitLeagueId}/transactions`,
          { method: "GET" }
        ),
        "Unable to load transactions"
      );
      return data?.transactions ?? [];
    }
  });
}

/** A league's draft snapshot, or null before the commissioner starts it. */
export function circuitDraftQuery(circuitLeagueId: number) {
  return queryOptions({
    queryKey: queryKeys.circuitLeagues.draft(circuitLeagueId),
    queryFn: async (): Promise<CircuitDraftSnapshot | null> => {
      const res = await fetchJson<CircuitDraftSnapshot>(
        `/circuit-leagues/${circuitLeagueId}/draft`,
        { method: "GET" }
      );
      if (!res.ok && res.errorCode === "CIRCUIT_DRAFT_NOT_STARTED") return null;
      const data = unwrap(res, "Unable to load the draft");
      if (!data) throw new ApiQueryError("Unable to load the draft");
      return data;
    }
  });
}

/** The viewer's draft queue in a league's season, top first. */
export function circuitQueueQuery(circuitLeagueId: number) {
  return queryOptions({
    queryKey: queryKeys.circuitLeagues.queue(circuitLeagueId),
    queryFn: async () => {
      const data = unwrap(
        await fetchJson<CircuitQueue>(`/circuit-leagues/${circuitLeagueId}/queue`, {
          method: "GET"
        }),
        "Unable to load your queue"
      );
      if (!data) throw new ApiQueryError("Unable to load your queue");
      return data;
    }
  });
}
