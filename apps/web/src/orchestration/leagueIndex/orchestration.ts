import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeagueMember, SeasonSummary } from "../../lib/types";
import {
  buildLeagueIndexRows,
  type LeagueIndexRow
} from "../../decisions/leagues/leagueIndex";
import { errorMessage, errorRequestId } from "../query/errors";
import { queryKeys } from "../query/keys";
import {
  leagueMembersQuery,
  leagueSeasonsQuery,
  leaguesListQuery
} from "../query/queries";

export type LeagueIndexView =
  | { state: "loading" }
  | { state: "error"; message: string; requestId?: string }
  | { state: "ready"; leagues: LeagueIndexRow[] };

export function useLeagueIndexOrchestration() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.leagues.index(),
    queryFn: async (): Promise<LeagueIndexRow[]> => {
      const leagues = await queryClient.fetchQuery(leaguesListQuery());

      const detailRows = await Promise.all(
        leagues.map(async (l) => {
          const [seasons, members] = await Promise.all([
            queryClient.fetchQuery(leagueSeasonsQuery(l.id)).catch(() => []),
            queryClient.fetchQuery(leagueMembersQuery(l.id)).catch(() => null)
          ]);
          return { leagueId: l.id, seasons, members };
        })
      );

      const leagueSeasons: Record<number, SeasonSummary[]> = {};
      const leagueMembers: Record<number, LeagueMember[] | null> = {};
      for (const row of detailRows) {
        leagueSeasons[row.leagueId] = row.seasons;
        leagueMembers[row.leagueId] = row.members;
      }
      return buildLeagueIndexRows({ leagues, leagueSeasons, leagueMembers });
    }
  });

  const view = useMemo<LeagueIndexView>(() => {
    if (query.data) return { state: "ready", leagues: query.data };
    if (query.isError) {
      return {
        state: "error",
        message: errorMessage(query.error, "Failed to load leagues"),
        requestId: errorRequestId(query.error)
      };
    }
    return { state: "loading" };
  }, [query.data, query.isError, query.error]);

  const { refetch } = query;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return useMemo(() => ({ view, refresh }), [view, refresh]);
}
