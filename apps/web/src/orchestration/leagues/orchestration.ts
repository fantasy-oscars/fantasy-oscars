import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import { notify } from "../../notifications";
import type {
  ApiResult,
  LeagueDetail,
  LeagueMember,
  LeagueSummary,
  SeasonSummary
} from "../../lib/types";
import {
  ApiQueryError,
  errorCode,
  errorFailure,
  errorMessage,
  errorRequestId,
  unwrap
} from "../query/errors";
import { queryKeys } from "../query/keys";
import { useFieldErrors } from "../useFieldErrors";
import {
  leagueMembersQuery,
  leagueQuery,
  leagueSeasonsQuery,
  leaguesListQuery
} from "../query/queries";

export type LeaguesIndexView =
  | { state: "loading" }
  | { state: "empty" }
  | { state: "error"; message: string; requestId?: string }
  | { state: "ready"; leagues: LeagueSummary[] };

export function useLeaguesIndexOrchestration() {
  const query = useQuery(leaguesListQuery());

  const view = useMemo<LeaguesIndexView>(() => {
    if (query.data) {
      return query.data.length
        ? { state: "ready", leagues: query.data }
        : { state: "empty" };
    }
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

  return { view, refresh };
}

export function useLeagueCreateOrchestration() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = useFieldErrors();
  const { applyFailure, reset: resetFieldErrors } = fieldErrors;

  const mutation = useMutation({
    mutationFn: async (input: { name: string }) =>
      unwrap(
        await fetchJson<{ league: LeagueSummary }>("/leagues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input)
        }),
        "Could not create league"
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leagues.all });
    }
  });

  const create = useCallback(
    async (input: { name: string }) => {
      setError(null);
      resetFieldErrors();
      try {
        const data = await mutation.mutateAsync(input);
        return { ok: true as const, league: data?.league };
      } catch (err) {
        const message = errorMessage(err, "Could not create league");
        // A message on the input replaces the separate banner.
        if (!applyFailure(errorFailure(err))) setError(message);
        return { ok: false as const, error: message };
      }
    },
    [mutation, applyFailure, resetFieldErrors]
  );

  return {
    creating: mutation.isPending,
    error,
    fieldErrors: fieldErrors.errors,
    onFormInput: fieldErrors.onFormInput,
    create
  };
}

export type LeagueDetailView =
  | { state: "loading" }
  | { state: "forbidden"; message: string; requestId?: string }
  | { state: "error"; message: string; requestId?: string }
  | {
      state: "ready";
      league: LeagueDetail;
      seasons: SeasonSummary[];
      roster: LeagueMember[] | null;
      isCommissioner: boolean;
      isOwner: boolean;
    };

type LeagueDetailData = {
  league: LeagueDetail;
  seasons: SeasonSummary[];
  roster: LeagueMember[] | null;
};

export function useLeagueDetailOrchestration(input: {
  leagueId: number;
  userSub?: string;
}) {
  const { leagueId, userSub } = input;
  const queryClient = useQueryClient();

  const [rosterStatus, setRosterStatus] = useState<ApiResult | null>(null);

  const userId = useMemo(() => Number(userSub), [userSub]);

  const query = useQuery({
    queryKey: queryKeys.leagues.detail(leagueId),
    enabled: !Number.isNaN(leagueId),
    queryFn: async (): Promise<LeagueDetailData> => {
      const [league, seasons, roster] = await Promise.all([
        queryClient.fetchQuery(leagueQuery(leagueId)),
        queryClient.fetchQuery(leagueSeasonsQuery(leagueId)).catch(() => []),
        queryClient.fetchQuery(leagueMembersQuery(leagueId)).catch(() => null)
      ]);
      return { league, seasons, roster };
    }
  });

  const view = useMemo<LeagueDetailView>(() => {
    if (Number.isNaN(leagueId)) return { state: "error", message: "Invalid league id" };
    if (query.data) {
      const { league, seasons, roster } = query.data;
      const isCommissioner =
        Number.isFinite(userId) &&
        !!roster?.some(
          (m) => m.user_id === userId && (m.role === "OWNER" || m.role === "CO_OWNER")
        );
      const isOwner =
        Number.isFinite(userId) &&
        !!roster?.some((m) => m.user_id === userId && m.role === "OWNER");
      return { state: "ready", league, seasons, roster, isCommissioner, isOwner };
    }
    if (query.isError) {
      return {
        state: errorCode(query.error) === "FORBIDDEN" ? "forbidden" : "error",
        message: errorMessage(query.error, "Unable to load league"),
        requestId: errorRequestId(query.error)
      };
    }
    return { state: "loading" };
  }, [leagueId, query.data, query.isError, query.error, userId]);

  const { refetch } = query;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const transferMutation = useMutation({
    mutationFn: async (vars: { leagueId: number; targetUserId: number }) =>
      unwrap(
        await fetchJson(`/leagues/${vars.leagueId}/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: vars.targetUserId })
        }),
        "Transfer failed"
      ),
    // Season detail embeds league members (drives isCommissioner), so refresh seasons too.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.leagues.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all })
      ])
  });

  const deleteMutation = useMutation({
    mutationFn: async (vars: { leagueId: number }) =>
      unwrap(
        await fetchJson(`/leagues/${vars.leagueId}`, { method: "DELETE" }),
        "Delete failed"
      ),
    onSuccess: () => {
      // The league is gone: mark everything stale without refetching the
      // still-mounted detail page (it would only get a 404). Pages that mount
      // next (the leagues index) refetch because their data is now stale.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.leagues.all,
        refetchType: "none"
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seasons.all,
        refetchType: "none"
      });
    }
  });

  const working = transferMutation.isPending || deleteMutation.isPending;

  const transferOwnershipTo = useCallback(
    async (targetUserId: number) => {
      if (view.state !== "ready") return { ok: false as const };
      if (!Number.isFinite(targetUserId)) return { ok: false as const };
      setRosterStatus(null);
      try {
        await transferMutation.mutateAsync({ leagueId: view.league.id, targetUserId });
      } catch (err) {
        setRosterStatus({ ok: false, message: errorMessage(err, "Transfer failed") });
        return { ok: false as const };
      }
      notify({
        id: "league.commissioner.transfer.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Commissioner role transferred"
      });
      setRosterStatus(null);
      return { ok: true as const };
    },
    [transferMutation, view]
  );

  const deleteLeague = useCallback(async () => {
    if (view.state !== "ready") return { ok: false as const };
    setRosterStatus(null);
    try {
      await deleteMutation.mutateAsync({ leagueId: view.league.id });
    } catch (err) {
      setRosterStatus({
        ok: false,
        message:
          err instanceof ApiQueryError ? err.message : errorMessage(err, "Delete failed")
      });
      return { ok: false as const };
    }
    notify({
      id: "league.delete.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "League deleted"
    });
    return { ok: true as const };
  }, [deleteMutation, view]);

  return {
    view,
    refresh,
    working,
    rosterStatus,
    transferOwnershipTo,
    deleteLeague
  };
}
