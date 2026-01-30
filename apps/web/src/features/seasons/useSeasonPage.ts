import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import { isIntegrityWarningWindow } from "../../lib/draft";
import type {
  ApiResult,
  LeagueMember,
  LeagueSummary,
  SeasonInvite,
  SeasonMember,
  SeasonMeta
} from "../../lib/types";

type LeagueContext = {
  league: LeagueSummary;
  season: SeasonMeta;
  leagueMembers: LeagueMember[];
};

type TokenMap = Record<number, string>;

export function useSeasonPage(seasonId: number, userSub?: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<SeasonMember[]>([]);
  const [invites, setInvites] = useState<SeasonInvite[]>([]);
  const [inviteTokens, setInviteTokens] = useState<TokenMap>({});
  const [leagueContext, setLeagueContext] = useState<LeagueContext | null>(null);
  const [scoringState, setScoringState] = useState<ApiResult | null>(null);
  const [allocationState, setAllocationState] = useState<ApiResult | null>(null);
  const [draftCreateResult, setDraftCreateResult] = useState<ApiResult | null>(null);
  const [cancelResult, setCancelResult] = useState<ApiResult | null>(null);
  const [addMemberResult, setAddMemberResult] = useState<ApiResult | null>(null);
  const [inviteResult, setInviteResult] = useState<ApiResult | null>(null);
  const [userInviteResult, setUserInviteResult] = useState<ApiResult | null>(null);
  const [working, setWorking] = useState(false);
  const [selectedLeagueMember, setSelectedLeagueMember] = useState<string>("");
  const [manualUsername, setManualUsername] = useState("");
  const [userInviteQuery, setUserInviteQuery] = useState("");
  const [placeholderLabel, setPlaceholderLabel] = useState("");
  const [labelDrafts, setLabelDrafts] = useState<Record<number, string>>({});
  const [nowTs, setNowTs] = useState(() => Date.now());

  const userId = useMemo(() => Number(userSub), [userSub]);
  const isCommissioner = useMemo(() => {
    if (!Number.isFinite(userId)) return false;
    return members.some(
      (m) => m.user_id === userId && (m.role === "OWNER" || m.role === "CO_OWNER")
    );
  }, [members, userId]);

  const isArchived = leagueContext?.season
    ? leagueContext.season.is_active_ceremony === false ||
      leagueContext.season.status !== "EXTANT"
    : false;
  const canEdit = !isArchived && isCommissioner;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const memberRes = await fetchJson<{ members: SeasonMember[] }>(
        `/seasons/${seasonId}/members`,
        { method: "GET" }
      );
      if (!memberRes.ok) {
        if (!cancelled) {
          setError(memberRes.error ?? "Could not load season");
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setMembers(memberRes.data?.members ?? []);

      // Discover league + season metadata by walking user leagues.
      const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues", {
        method: "GET"
      });
      let found: { league: LeagueSummary; season: SeasonMeta } | null = null;
      let leagueMembers: LeagueMember[] = [];
      if (leaguesRes.ok && leaguesRes.data?.leagues) {
        for (const lg of leaguesRes.data.leagues) {
          const seasonsRes = await fetchJson<{
            seasons: Array<SeasonMeta & { id: number }>;
          }>(`/leagues/${lg.id}/seasons`, { method: "GET" });
          if (seasonsRes.ok) {
            const match = (seasonsRes.data?.seasons ?? []).find((s) => s.id === seasonId);
            if (match) {
              found = { league: lg, season: match };
              const rosterRes = await fetchJson<{ members: LeagueMember[] }>(
                `/leagues/${lg.id}/members`,
                { method: "GET" }
              );
              if (rosterRes.ok && rosterRes.data?.members) {
                leagueMembers = rosterRes.data.members;
              }
              break;
            }
          }
        }
      }
      if (!cancelled && found) {
        setLeagueContext({ ...found, leagueMembers });
      }

      const invitesRes = await fetchJson<{ invites: SeasonInvite[] }>(
        `/seasons/${seasonId}/invites`,
        { method: "GET" }
      );
      if (!cancelled && invitesRes.ok) {
        setInvites(invitesRes.data?.invites ?? []);
      }
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [seasonId]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  async function addMember() {
    const username = manualUsername.trim();
    const userIdRaw = selectedLeagueMember;
    const userIdToAdd = userIdRaw ? Number(userIdRaw) : null;

    if (!username && !userIdRaw) return;
    if (!username && (!Number.isFinite(Number(userIdToAdd)) || (userIdToAdd ?? 0) <= 0)) {
      setAddMemberResult({ ok: false, message: "Select a user or enter a username" });
      return;
    }
    setWorking(true);
    setAddMemberResult(null);
    const res = await fetchJson<{ member: SeasonMember }>(
      `/seasons/${seasonId}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(username ? { username } : { user_id: userIdToAdd })
      }
    );
    setWorking(false);
    const member = res.data?.member;
    if (res.ok && member) {
      setMembers((prev) => [...prev, member]);
      setAddMemberResult({ ok: true, message: "Added to season" });
      setSelectedLeagueMember("");
      setManualUsername("");
    } else {
      setAddMemberResult({ ok: false, message: res.error ?? "Add failed" });
    }
  }

  async function removeMember(userIdToRemove: number) {
    setWorking(true);
    const res = await fetchJson(`/seasons/${seasonId}/members/${userIdToRemove}`, {
      method: "DELETE"
    });
    setWorking(false);
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userIdToRemove));
    } else {
      setAddMemberResult({ ok: false, message: res.error ?? "Remove failed" });
    }
  }

  async function updateScoring(strategy: string) {
    setScoringState(null);
    setWorking(true);
    const res = await fetchJson<{ season: SeasonMeta }>(`/seasons/${seasonId}/scoring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scoring_strategy_name: strategy })
    });
    setWorking(false);
    if (res.ok && res.data?.season && leagueContext) {
      setLeagueContext({
        ...leagueContext,
        season: {
          ...leagueContext.season,
          scoring_strategy_name: res.data.season.scoring_strategy_name
        }
      });
      setScoringState({ ok: true, message: "Scoring updated" });
    } else {
      setScoringState({ ok: false, message: res.error ?? "Update failed" });
    }
  }

  async function updateAllocation(strategy: string) {
    setAllocationState(null);
    setWorking(true);
    const res = await fetchJson<{ season: SeasonMeta }>(
      `/seasons/${seasonId}/allocation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remainder_strategy: strategy })
      }
    );
    setWorking(false);
    if (res.ok && res.data?.season && leagueContext) {
      setLeagueContext({
        ...leagueContext,
        season: {
          ...leagueContext.season,
          remainder_strategy: res.data.season.remainder_strategy
        }
      });
      setAllocationState({ ok: true, message: "Allocation updated" });
    } else {
      setAllocationState({ ok: false, message: res.error ?? "Update failed" });
    }
  }

  async function createDraft() {
    const leagueId = leagueContext?.league?.id;
    if (!leagueId) {
      setDraftCreateResult({ ok: false, message: "Missing league context" });
      return;
    }
    if (!Number.isFinite(seasonId) || seasonId <= 0) {
      setDraftCreateResult({ ok: false, message: "Invalid season" });
      return;
    }

    setDraftCreateResult(null);
    setWorking(true);
    const res = await fetchJson<{
      draft?: { id: number; status: string; pick_timer_seconds?: number | null };
    }>(`/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league_id: leagueId, season_id: seasonId })
    });
    setWorking(false);

    const draft = res.ok ? res.data?.draft : null;
    if (!res.ok || !draft?.id) {
      setDraftCreateResult({ ok: false, message: res.error ?? "Failed to create draft" });
      return;
    }

    setLeagueContext((prev) =>
      prev
        ? {
            ...prev,
            season: {
              ...prev.season,
              draft_id: draft.id,
              draft_status: draft.status,
              pick_timer_seconds:
                draft.pick_timer_seconds === undefined
                  ? prev.season.pick_timer_seconds
                  : draft.pick_timer_seconds
            }
          }
        : prev
    );
    setDraftCreateResult({ ok: true, message: "Draft created" });
  }

  async function cancelSeason() {
    if (!Number.isFinite(seasonId) || seasonId <= 0) return;
    setCancelResult(null);
    setWorking(true);
    const res = await fetchJson<{ season?: { status?: string } }>(
      `/seasons/${seasonId}/cancel`,
      {
        method: "POST"
      }
    );
    setWorking(false);
    if (!res.ok) {
      setCancelResult({ ok: false, message: res.error ?? "Failed to delete season" });
      return;
    }
    setLeagueContext((prev) =>
      prev
        ? {
            ...prev,
            season: { ...prev.season, status: "CANCELLED" }
          }
        : prev
    );
    setCancelResult({ ok: true, message: "Season deleted" });
  }

  async function createUserInvite() {
    const username = userInviteQuery.trim();
    if (!username) {
      setUserInviteResult({ ok: false, message: "Enter a username" });
      return;
    }
    setWorking(true);
    setUserInviteResult(null);
    const res = await fetchJson(`/seasons/${seasonId}/user-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    setWorking(false);
    setUserInviteResult({
      ok: res.ok,
      message: res.ok
        ? "Invite created (user must accept in app)"
        : (res.error ?? "Invite failed")
    });
    if (res.ok) setUserInviteQuery("");
  }

  async function createPlaceholderInvite() {
    setWorking(true);
    setInviteResult(null);
    const res = await fetchJson<{ invite: SeasonInvite; token: string }>(
      `/seasons/${seasonId}/invites`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          placeholderLabel.trim() ? { label: placeholderLabel.trim() } : {}
        )
      }
    );
    setWorking(false);
    const invite = res.data?.invite;
    const token = res.data?.token;
    if (res.ok && invite && token) {
      setInvites((prev) => [invite, ...prev]);
      setInviteTokens((prev) => ({ ...prev, [invite.id]: token }));
      setPlaceholderLabel("");
      setInviteResult({ ok: true, message: "Link generated" });
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Invite failed" });
    }
  }

  async function revokeInvite(inviteId: number) {
    setWorking(true);
    const res = await fetchJson<{ invite: SeasonInvite }>(
      `/seasons/${seasonId}/invites/${inviteId}/revoke`,
      { method: "POST" }
    );
    setWorking(false);
    const invite = res.data?.invite;
    if (res.ok && invite) {
      setInvites((prev) => prev.map((i) => (i.id === inviteId ? invite : i)));
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Revoke failed" });
    }
  }

  async function regenerateInvite(inviteId: number) {
    setWorking(true);
    const res = await fetchJson<{ invite: SeasonInvite; token: string }>(
      `/seasons/${seasonId}/invites/${inviteId}/regenerate`,
      { method: "POST" }
    );
    setWorking(false);
    const invite = res.data?.invite;
    const token = res.data?.token;
    if (res.ok && invite && token) {
      setInvites((prev) => prev.map((i) => (i.id === inviteId ? invite : i)));
      setInviteTokens((prev) => ({ ...prev, [invite.id]: token }));
      setInviteResult({ ok: true, message: "New link generated" });
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Regenerate failed" });
    }
  }

  async function saveInviteLabel(inviteId: number) {
    const nextLabel = labelDrafts[inviteId] ?? "";
    setWorking(true);
    const res = await fetchJson<{ invite: SeasonInvite }>(
      `/seasons/${seasonId}/invites/${inviteId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: nextLabel.trim() || null })
      }
    );
    setWorking(false);
    const invite = res.data?.invite;
    if (res.ok && invite) {
      setInvites((prev) => prev.map((i) => (i.id === inviteId ? invite : i)));
      setInviteResult({ ok: true, message: "Label saved" });
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Save failed" });
    }
  }

  function formatDate(value?: string | null) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  function buildInviteLink(inviteId: number) {
    const token = inviteTokens[inviteId];
    const pathToken = token ?? String(inviteId);
    return `${window.location.origin}/invites/${pathToken}`;
  }

  function copyLink(inviteId: number) {
    const link = buildInviteLink(inviteId);
    void navigator.clipboard?.writeText(link);
    setInviteResult({ ok: true, message: "Link copied" });
  }

  const seasonStatus = leagueContext?.season?.status ?? "UNKNOWN";
  const scoringStrategy = leagueContext?.season?.scoring_strategy_name ?? "fixed";
  const allocationStrategy = leagueContext?.season?.remainder_strategy ?? "UNDRAFTED";
  const availableLeagueMembers =
    leagueContext?.leagueMembers?.filter(
      (m) => !members.some((sm) => sm.user_id === m.user_id)
    ) ?? [];
  const ceremonyStartsAt = leagueContext?.season?.ceremony_starts_at ?? null;
  const draftId = leagueContext?.season?.draft_id ?? null;
  const draftStatus = leagueContext?.season?.draft_status ?? null;
  const draftWarningEligible =
    (leagueContext?.season?.is_active_ceremony ?? false) &&
    draftStatus &&
    (draftStatus === "PENDING" ||
      draftStatus === "IN_PROGRESS" ||
      draftStatus === "PAUSED");
  const integrityWarningActive =
    draftWarningEligible && isIntegrityWarningWindow(ceremonyStartsAt, nowTs);

  return {
    loading,
    error,
    members,
    invites,
    inviteTokens,
    leagueContext,
    scoringState,
    allocationState,
    draftCreateResult,
    cancelResult,
    addMemberResult,
    inviteResult,
    userInviteResult,
    working,
    selectedLeagueMember,
    setSelectedLeagueMember,
    manualUsername,
    setManualUsername,
    userInviteQuery,
    setUserInviteQuery,
    placeholderLabel,
    setPlaceholderLabel,
    labelDrafts,
    setLabelDrafts,
    isCommissioner,
    isArchived,
    canEdit,
    seasonStatus,
    scoringStrategy,
    allocationStrategy,
    availableLeagueMembers,
    ceremonyStartsAt,
    draftId,
    draftStatus,
    integrityWarningActive,
    addMember,
    removeMember,
    updateScoring,
    updateAllocation,
    createDraft,
    cancelSeason,
    createUserInvite,
    createPlaceholderInvite,
    revokeInvite,
    regenerateInvite,
    saveInviteLabel,
    formatDate,
    buildInviteLink,
    copyLink
  };
}
