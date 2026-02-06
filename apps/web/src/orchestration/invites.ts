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
      const message = "Invalid invite link";
      setResult({ ok: false, message });
      return { ok: false as const, error: message };
    }
    const isNumericId = /^\d+$/.test(token);
    setLoading(true);
    const res = await fetchJson<{ invite?: { season_id?: number } }>(
      isNumericId ? `/seasons/invites/${token}/accept` : `/seasons/invites/token/${token}/accept`,
      { method: "POST" }
    );
    setLoading(false);
    if (!res.ok) {
      const message = mapInviteError(res.errorCode, res.error);
      setResult({ ok: false, message });
      return { ok: false as const, error: message };
    }
    setResult(null);
    return { ok: true as const, seasonId: res.data?.invite?.season_id };
  }, [token]);

  const decline = useCallback(async () => {
    if (!token) {
      const message = "Invalid invite link";
      setResult({ ok: false, message });
      return { ok: false as const, error: message };
    }
    const isNumericId = /^\d+$/.test(token);
    setLoading(true);
    const res = await fetchJson(
      isNumericId ? `/seasons/invites/${token}/decline` : `/seasons/invites/token/${token}/decline`,
      { method: "POST" }
    );
    setLoading(false);
    if (!res.ok) {
      const message = mapInviteError(res.errorCode, res.error ?? "Decline failed");
      setResult({ ok: false, message });
      return { ok: false as const, error: message };
    }
    setResult(null);
    return { ok: true as const };
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
    // Defensive: treat null/invalid rows as already-resolved invites and hide them.
    const invites = Array.isArray(res.data?.invites)
      ? (res.data!.invites as unknown[]).filter(
          (i): i is InboxInvite =>
            Boolean(i) &&
            typeof (i as { id?: unknown }).id === "number" &&
            Number.isFinite((i as { id: number }).id) &&
            (i as { id: number }).id > 0
        )
      : [];
    setView({ state: "ready", invites });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accept = useCallback(async (invite: InboxInvite) => {
    const res = await fetchJson(`/seasons/invites/${invite.id}/accept`, {
      method: "POST"
    });
    if (!res.ok)
      return {
        ok: false as const,
        error: res.error ?? "Unable to accept invite",
        errorCode: res.errorCode
      };

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
      return {
        ok: false as const,
        error: res.error ?? "Unable to decline invite",
        errorCode: res.errorCode
      };
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
