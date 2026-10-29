import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CeremonySummary } from "../../lib/types";
import {
  buildSeasonIndexCards,
  type SeasonIndexCard
} from "../../decisions/seasons/seasonIndexCards";
import { errorMessage, errorRequestId } from "../query/errors";
import { queryKeys } from "../query/keys";
import {
  ceremoniesListQuery,
  leagueSeasonsQuery,
  leaguesListQuery
} from "../query/queries";

export type SeasonsIndexView =
  | { state: "loading" }
  | { state: "error"; message: string; requestId?: string }
  | { state: "ready"; seasons: SeasonIndexCard[] };

export function useSeasonsIndexOrchestration() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.seasons.index(),
    queryFn: async (): Promise<SeasonIndexCard[]> => {
      const [leagues, ceremonies] = await Promise.all([
        queryClient.fetchQuery(leaguesListQuery()),
        queryClient.fetchQuery(ceremoniesListQuery())
      ]);

      const ceremonyById = new Map<number, CeremonySummary>();
      for (const c of ceremonies) ceremonyById.set(c.id, c);

      const seasonResults = await Promise.all(
        leagues.map(async (league) => ({
          league,
          seasons: await queryClient
            .fetchQuery(leagueSeasonsQuery(league.id))
            .catch(() => [])
        }))
      );

      return buildSeasonIndexCards({ seasonResults, ceremonyById });
    }
  });

  const view = useMemo<SeasonsIndexView>(() => {
    if (query.data) return { state: "ready", seasons: query.data };
    if (query.isError) {
      return {
        state: "error",
        message: errorMessage(query.error, "Failed to load seasons"),
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
