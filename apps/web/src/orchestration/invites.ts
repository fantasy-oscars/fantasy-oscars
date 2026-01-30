import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import type { ApiResult, InboxInvite, SeasonMeta } from "../lib/types";
import { mapInviteError } from "../decisions/invites";

export function useInviteClaimOrchestration(input: { token?: string }) {
  const token = input.token;
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  const accept = useCallback(async () => {
    if (!token) {
      setResult({ ok: false, message: "Invalid invite link" });
      return { ok: false as const };
    }
    setLoading(true);
    const res = await fetchJson<{ invite?: { season_id?: number } }>(
      `/seasons/invites/${token}/accept`,
      { method: "POST" }
    );
    setLoading(false);
    if (!res.ok) {
      setResult({ ok: false, message: mapInviteError(res.errorCode, res.error) });
      return { ok: false as const };
    }
    setResult({ ok: true, message: "Invite accepted" });
    return { ok: true as const, seasonId: res.data?.invite?.season_id };
  }, [token]);

  const decline = useCallback(async () => {
    if (!token) {
      setResult({ ok: false, message: "Invalid invite link" });
      return { ok: false as const };
    }
    setLoading(true);
    const res = await fetchJson(`/seasons/invites/${token}/decline`, { method: "POST" });
    setLoading(false);
    setResult({
      ok: res.ok as boolean,
      message: res.ok ? "Invite declined" : (res.error ?? "Decline failed")
    });
    return { ok: res.ok as boolean };
  }, [token]);

  return { loading, result, accept, decline };
}

export type InvitesInboxView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; invites: InboxInvite[] };

export function useInvitesInboxOrchestration() {
  const [view, setView] = useState<InvitesInboxView>({ state: "loading" });

  const refresh = useCallback(async () => {
    setView({ state: "loading" });
    const res = await fetchJson<{ invites: InboxInvite[] }>("/seasons/invites/inbox", {
      method: "GET"
    });
    if (!res.ok) {
      setView({ state: "error", message: res.error ?? "Could not load invites" });
      return;
    }
    setView({ state: "ready", invites: res.data?.invites ?? [] });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accept = useCallback(async (invite: InboxInvite) => {
    const res = await fetchJson(`/seasons/invites/${invite.id}/accept`, {
      method: "POST"
    });
    if (!res.ok)
      return { ok: false as const, error: res.error ?? "Unable to accept invite" };

    // Try to navigate to season if extant; otherwise league fallback.
    if (invite.league_id) {
      const seasonsRes = await fetchJson<{ seasons: SeasonMeta[] }>(
        `/leagues/${invite.league_id}/seasons`,
        { method: "GET" }
      );
      if (seasonsRes.ok) {
        const seasonMeta = (seasonsRes.data?.seasons ?? []).find(
          (s) => s.id === invite.season_id
        );
        if (seasonMeta && seasonMeta.status === "EXTANT") {
          return { ok: true as const, destination: `/seasons/${invite.season_id}` };
        }
      }
      return { ok: true as const, destination: `/leagues/${invite.league_id}` };
    }
    return { ok: true as const, destination: "/leagues" };
  }, []);

  const decline = useCallback(async (invite: InboxInvite) => {
    const res = await fetchJson(`/seasons/invites/${invite.id}/decline`, {
      method: "POST"
    });
    if (!res.ok)
      return { ok: false as const, error: res.error ?? "Unable to decline invite" };
    return { ok: true as const };
  }, []);

  const removeFromView = useCallback((inviteId: number) => {
    setView((prev) => {
      if (prev.state !== "ready") return prev;
      return { state: "ready", invites: prev.invites.filter((i) => i.id !== inviteId) };
    });
  }, []);

  return { view, refresh, accept, decline, removeFromView };
}
