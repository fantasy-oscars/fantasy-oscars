import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import type { ApiResult, InboxInvite } from "../../lib/types";
import { mapInviteError } from "../../decisions/invites";
import { leaguePath, seasonPath } from "../../lib/routes";
import { errorMessage, errorRequestId } from "../query/errors";
import { queryKeys } from "../query/keys";
import { invitesInboxQuery, leagueSeasonsQuery } from "../query/queries";

/** An accepted/declined invite changes the inbox and what leagues/seasons the user sees. */
export function invalidateAfterInviteChange(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.invites.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.leagues.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all })
  ]);
}

export function useInviteClaimOrchestration(input: { token?: string }) {
  const token = input.token;
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  const accept = useCallback(async () => {
    if (!token) {
      const message = "Invalid invite link";
      setResult({ ok: false, message });
      return { ok: false as const, error: message };
    }
    const isNumericId = /^\d+$/.test(token);
    setLoading(true);
    const res = await fetchJson<{
      invite?: { season_id?: number };
      already_member?: boolean;
    }>(
      isNumericId
        ? `/seasons/invites/${token}/accept`
        : `/seasons/invites/token/${token}/accept`,
      { method: "POST" }
    );
    setLoading(false);
    if (!res.ok) {
      const message = mapInviteError(res.errorCode, res.error);
      setResult({ ok: false, message, requestId: res.requestId });
      return { ok: false as const, error: message };
    }
    setResult(null);
    await invalidateAfterInviteChange(queryClient);
    return {
      ok: true as const,
      seasonId: res.data?.invite?.season_id,
      alreadyMember: Boolean(res.data?.already_member)
    };
  }, [token, queryClient]);

  const decline = useCallback(async () => {
    if (!token) {
      const message = "Invalid invite link";
      setResult({ ok: false, message });
      return { ok: false as const, error: message };
    }
    const isNumericId = /^\d+$/.test(token);
    setLoading(true);
    const res = await fetchJson(
      isNumericId
        ? `/seasons/invites/${token}/decline`
        : `/seasons/invites/token/${token}/decline`,
      { method: "POST" }
    );
    setLoading(false);
    if (!res.ok) {
      const message = mapInviteError(res.errorCode, res.error ?? "Decline failed");
      setResult({ ok: false, message, requestId: res.requestId });
      return { ok: false as const, error: message };
    }
    setResult(null);
    await invalidateAfterInviteChange(queryClient);
    return { ok: true as const };
  }, [token, queryClient]);

  return { loading, result, accept, decline };
}

export type InvitesInboxView =
  | { state: "loading" }
  | { state: "error"; message: string; requestId?: string }
  | { state: "ready"; invites: InboxInvite[] };

export function useInvitesInboxOrchestration() {
  const queryClient = useQueryClient();
  const query = useQuery(invitesInboxQuery());

  const view = useMemo<InvitesInboxView>(() => {
    if (query.data) return { state: "ready", invites: query.data };
    if (query.isError) {
      return {
        state: "error",
        message: errorMessage(query.error, "Could not load invites"),
        requestId: errorRequestId(query.error)
      };
    }
    return { state: "loading" };
  }, [query.data, query.isError, query.error]);

  const { refetch } = query;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const accept = useCallback(
    async (invite: InboxInvite) => {
      const res = await fetchJson(`/seasons/invites/${invite.id}/accept`, {
        method: "POST"
      });
      if (!res.ok) {
        if (res.errorCode === "NOT_FOUND") {
          void queryClient.invalidateQueries({ queryKey: queryKeys.invites.all });
        }
        return {
          ok: false as const,
          error: res.error ?? "Unable to accept invite",
          errorCode: res.errorCode
        };
      }

      // Joining a season changes leagues/seasons/inbox; mark them stale before
      // looking up where to send the user.
      await invalidateAfterInviteChange(queryClient);

      // Try to navigate to season if extant; otherwise league fallback.
      if (invite.league_id) {
        try {
          const seasons = await queryClient.fetchQuery(
            leagueSeasonsQuery(invite.league_id)
          );
          const seasonMeta = seasons.find((s) => s.id === invite.season_id);
          if (seasonMeta && seasonMeta.status === "EXTANT") {
            return {
              ok: true as const,
              destination: seasonPath({
                leagueId: invite.league_id,
                leagueName: invite.league_name,
                ceremonyCode: seasonMeta.ceremony_code,
                ceremonyId: seasonMeta.ceremony_id
              })
            };
          }
        } catch {
          // Fall through to the league page.
        }
        return {
          ok: true as const,
          destination: leaguePath({
            leagueId: invite.league_id,
            leagueName: invite.league_name
          })
        };
      }
      return { ok: true as const, destination: "/leagues" };
    },
    [queryClient]
  );

  const decline = useCallback(
    async (invite: InboxInvite) => {
      const res = await fetchJson(`/seasons/invites/${invite.id}/decline`, {
        method: "POST"
      });
      if (!res.ok) {
        if (res.errorCode === "NOT_FOUND") {
          void queryClient.invalidateQueries({ queryKey: queryKeys.invites.all });
        }
        return {
          ok: false as const,
          error: res.error ?? "Unable to decline invite",
          errorCode: res.errorCode
        };
      }
      await invalidateAfterInviteChange(queryClient);
      return { ok: true as const };
    },
    [queryClient]
  );

  const removeFromView = useCallback(
    (inviteId: number) => {
      queryClient.setQueryData<InboxInvite[]>(queryKeys.invites.inbox(), (prev) =>
        prev ? prev.filter((i) => i.id !== inviteId) : prev
      );
    },
    [queryClient]
  );

  return { view, refresh, accept, decline, removeFromView };
}
