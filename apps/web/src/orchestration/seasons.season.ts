import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import { notify } from "../notifications";
import { formatLocalDateTime } from "./seasons/seasonFormat";
import { copySeasonInviteLink } from "./seasons/seasonInviteLinks";
import {
  computeAvailableLeagueMembers,
  computeIntegrityWarningActive,
  computeSeasonIsArchived
} from "./seasons/seasonSelectors";
import { useSeasonInviteeSearch } from "./seasons/useSeasonInviteeSearch";
import { loadLeagueContextForSeason } from "./seasons/loadLeagueContextForSeason";
import type {
  ApiResult,
  LeagueMember,
  LeagueSummary,
  SeasonInvite,
  SeasonMember,
  SeasonMeta
} from "../lib/types";

type LeagueContext = {
  league: LeagueSummary;
  season: SeasonMeta;
  leagueMembers: LeagueMember[];
};

type TokenMap = Record<number, string>;

export function useSeasonOrchestration(seasonId: number, userSub?: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<SeasonMember[]>([]);
  const [invites, setInvites] = useState<SeasonInvite[]>([]);
  const [inviteTokens, setInviteTokens] = useState<TokenMap>({});
  const [leagueContext, setLeagueContext] = useState<LeagueContext | null>(null);
  const [ceremonyStatus, setCeremonyStatus] = useState<string | null>(null);
  const [scoringState, setScoringState] = useState<ApiResult | null>(null);
  const [allocationState, setAllocationState] = useState<ApiResult | null>(null);
  const [timerState, setTimerState] = useState<ApiResult | null>(null);
  const [draftCreateResult, setDraftCreateResult] = useState<ApiResult | null>(null);
  const [cancelResult, setCancelResult] = useState<ApiResult | null>(null);
  const [addMemberResult, setAddMemberResult] = useState<ApiResult | null>(null);
  const [inviteResult, setInviteResult] = useState<ApiResult | null>(null);
  const [userInviteResult, setUserInviteResult] = useState<ApiResult | null>(null);
  const [working, setWorking] = useState(false);
  const [selectedLeagueMember, setSelectedLeagueMember] = useState<string>("");
  const [manualUsername, setManualUsername] = useState("");
  const [userInviteQuery, setUserInviteQuery] = useState("");
  const [userInviteSelectedUserId, setUserInviteSelectedUserId] = useState<number | null>(
    null
  );
  const [userInviteMatches, setUserInviteMatches] = useState<
    Array<{ id: number; username: string }>
  >([]);
  const [userInviteSearching, setUserInviteSearching] = useState(false);
  const [placeholderLabel, setPlaceholderLabel] = useState("");
  const [labelDrafts, setLabelDrafts] = useState<Record<number, string>>({});
  const [nowTs, setNowTs] = useState(() => Date.now());

  const [timerEnabled, setTimerEnabled] = useState(true);
  const [pickTimerSeconds, setPickTimerSeconds] = useState(60);

  const userId = useMemo(() => Number(userSub), [userSub]);
  const isCommissioner = useMemo(() => {
    if (!Number.isFinite(userId)) return false;
    const seasonRole = members.some(
      (m) => m.user_id === userId && (m.role === "OWNER" || m.role === "CO_OWNER")
    );
    const leagueRole = (leagueContext?.leagueMembers ?? []).some(
      (m) => m.user_id === userId && (m.role === "OWNER" || m.role === "CO_OWNER")
    );
    return seasonRole || leagueRole;
  }, [members, leagueContext?.leagueMembers, userId]);

  const isArchived = computeSeasonIsArchived(leagueContext?.season ?? null);
  const canEdit = !isArchived && isCommissioner;

  useSeasonInviteeSearch({
    canEdit,
    seasonId,
    query: userInviteQuery,
    setSearching: setUserInviteSearching,
    setMatches: setUserInviteMatches
  });

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

      const found = await loadLeagueContextForSeason(seasonId);
      if (!cancelled && found) {
        setLeagueContext({
          league: found.league,
          season: found.season,
          leagueMembers: found.leagueMembers
        });
        setCeremonyStatus(found.ceremonyStatus);
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

  useEffect(() => {
    const value = leagueContext?.season?.pick_timer_seconds ?? null;
    if (value && value > 0) {
      setTimerEnabled(true);
      setPickTimerSeconds(value);
    } else {
      setTimerEnabled(false);
      setPickTimerSeconds(60);
    }
  }, [leagueContext?.season?.pick_timer_seconds]);

  async function addMember() {
    const username = manualUsername.trim();
    const userIdRaw = selectedLeagueMember;
    const userIdToAdd = userIdRaw ? Number(userIdRaw) : null;

    if (!username && !userIdRaw) return;
    if (!username && (!Number.isFinite(userIdToAdd) || (userIdToAdd ?? 0) <= 0)) {
      setAddMemberResult({ ok: false, message: "Pick a user" });
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

    if (!res.ok || !res.data?.member) {
      setAddMemberResult({ ok: false, message: res.error ?? "Unable to add member" });
      return;
    }

    setMembers((prev) => [...prev, res.data!.member]);
    setSelectedLeagueMember("");
    setManualUsername("");
    setAddMemberResult(null);
    notify({
      id: "season.members.added",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Member added"
    });
  }

  async function removeMember(userIdToRemove: number) {
    if (!Number.isFinite(userIdToRemove) || userIdToRemove <= 0) return;
    setWorking(true);
    setAddMemberResult(null);
    const res = await fetchJson(`/seasons/${seasonId}/members/${userIdToRemove}`, {
      method: "DELETE"
    });
    setWorking(false);
    if (!res.ok) {
      setAddMemberResult({ ok: false, message: res.error ?? "Remove failed" });
      return;
    }
    setMembers((prev) => prev.filter((m) => m.user_id !== userIdToRemove));
    setAddMemberResult(null);
    notify({
      id: "season.members.removed",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Member removed"
    });
  }

  async function updateScoring(
    strategy: string,
    opts?: { categoryWeights?: Record<string, number> | null }
  ) {
    setScoringState(null);
    setWorking(true);
    const res = await fetchJson<{ season: SeasonMeta }>(`/seasons/${seasonId}/scoring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scoring_strategy_name: strategy,
        category_weights: opts?.categoryWeights ?? undefined
      })
    });
    setWorking(false);
    if (res.ok && res.data?.season && leagueContext) {
      setLeagueContext({
        ...leagueContext,
        season: {
          ...leagueContext.season,
          scoring_strategy_name: res.data.season.scoring_strategy_name,
          category_weights:
            res.data.season.category_weights ??
            leagueContext.season.category_weights ??
            null
        }
      });
      notify({
        id: "season.scoring.update.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Scoring updated"
      });
      setScoringState(null);
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
      notify({
        id: "season.allocation.update.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Allocation updated"
      });
      setAllocationState(null);
    } else {
      setAllocationState({ ok: false, message: res.error ?? "Update failed" });
    }
  }

  async function updateTimerWith(pick_timer_seconds: number | null) {
    setTimerState(null);
    setWorking(true);
    const res = await fetchJson<{
      draft: {
        id: number;
        pick_timer_seconds: number | null;
        auto_pick_strategy: string | null;
      };
    }>(`/seasons/${seasonId}/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pick_timer_seconds
      })
    });
    setWorking(false);
    if (res.ok && res.data?.draft && leagueContext) {
      setLeagueContext({
        ...leagueContext,
        season: {
          ...leagueContext.season,
          pick_timer_seconds: res.data.draft.pick_timer_seconds ?? null
        }
      });
      notify({
        id: "season.timer.update.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Timer updated"
      });
      setTimerState(null);
    } else {
      setTimerState({ ok: false, message: res.error ?? "Update failed" });
    }
  }

  async function updateTimer() {
    return updateTimerWith(timerEnabled ? pickTimerSeconds : null);
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
    notify({
      id: "season.draft.create.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Draft created"
    });
    setDraftCreateResult(null);
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
    notify({
      id: "season.delete.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Season deleted"
    });
    setCancelResult(null);
  }

  async function transferSeasonOwnership(targetUserId: number) {
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) return;
    setWorking(true);
    const res = await fetchJson<{ ok: true }>(`/seasons/${seasonId}/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: targetUserId })
    });
    setWorking(false);

    if (!res.ok) {
      notify({
        id: "season.ownership.transfer.error",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: res.error ?? "Ownership transfer failed"
      });
      return;
    }

    setMembers((prev) =>
      prev.map((m) => {
        if (m.role === "OWNER") return { ...m, role: "MEMBER" };
        if (m.user_id === targetUserId) return { ...m, role: "OWNER" };
        return m;
      })
    );

    notify({
      id: "season.ownership.transfer.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Ownership transferred"
    });
  }

  async function createUserInvite() {
    const username = userInviteQuery.trim();
    if (!username && !userInviteSelectedUserId) {
      setUserInviteResult({ ok: false, message: "Enter a username or select a user" });
      return;
    }
    setWorking(true);
    setUserInviteResult(null);
    const res = await fetchJson(`/seasons/${seasonId}/user-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        userInviteSelectedUserId ? { user_id: userInviteSelectedUserId } : { username }
      )
    });
    setWorking(false);
    if (res.ok) {
      notify({
        id: "season.invite.create.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Invite created (user must accept in app)"
      });
      setUserInviteQuery("");
      setUserInviteSelectedUserId(null);
      setUserInviteMatches([]);
      setUserInviteResult(null);
      return;
    }
    const message = res.error ?? "Invite failed";
    notify({
      id: "season.invite.create.error",
      severity: "error",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message
    });
    setUserInviteResult({ ok: false, message });
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
      notify({
        id: "season.invite.link.generate.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Link generated"
      });
      setInviteResult(null);
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Invite failed" });
    }
  }

  async function revokeInvite(inviteId: number) {
    setWorking(true);
    const res = await fetchJson<{ invite: SeasonInvite }>(
      `/seasons/${seasonId}/invites/${inviteId}/revoke`,
      {
        method: "POST"
      }
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
      notify({
        id: "season.invite.link.regenerate.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "New link generated"
      });
      setInviteResult(null);
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
      notify({
        id: "season.invite.label.save.success",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Label saved"
      });
      setInviteResult(null);
    } else {
      setInviteResult({ ok: false, message: res.error ?? "Save failed" });
    }
  }

  function formatDate(value?: string | null) {
    return formatLocalDateTime(value);
  }

  function buildInviteLink(inviteId: number) {
    const token = inviteTokens[inviteId];
    return `${window.location.origin}/invites/${token ?? String(inviteId)}`;
  }

  function copyLink(inviteId: number) {
    copySeasonInviteLink({ inviteId, token: inviteTokens[inviteId] });
    setInviteResult(null);
  }

  const seasonStatus = leagueContext?.season?.status ?? "UNKNOWN";
  const scoringStrategy = leagueContext?.season?.scoring_strategy_name ?? "fixed";
  const allocationStrategy = leagueContext?.season?.remainder_strategy ?? "UNDRAFTED";
  const availableLeagueMembers = computeAvailableLeagueMembers({
    leagueMembers: leagueContext?.leagueMembers,
    seasonMembers: members
  });
  const ceremonyStartsAt = leagueContext?.season?.ceremony_starts_at ?? null;
  const draftId = leagueContext?.season?.draft_id ?? null;
  const draftStatus = leagueContext?.season?.draft_status ?? null;
  const integrityWarningActive = computeIntegrityWarningActive({
    season: leagueContext?.season ?? null,
    nowTs
  });

  const getCeremonyCategoriesForWeights = useCallback(async (ceremonyId: number) => {
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) {
      return { ok: false as const, error: "Invalid ceremony id" };
    }
    const res = await fetchJson<{
      categories: Array<{ id: number; sort_index: number; family_name: string }>;
    }>(`/ceremonies/${ceremonyId}`, { method: "GET" });
    if (!res.ok) {
      return { ok: false as const, error: res.error ?? "Unable to load categories" };
    }
    const cats = Array.isArray(res.data?.categories) ? res.data!.categories : [];
    return { ok: true as const, categories: cats };
  }, []);

  return {
    loading,
    error,
    members,
    invites,
    inviteTokens,
    leagueContext,
    ceremonyStatus,
    scoringState,
    allocationState,
    timerState,
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
    setUserInviteQuery: (next: string) => {
      // If the user starts typing after selecting an option, clear the selection.
      setUserInviteSelectedUserId(null);
      setUserInviteQuery(next);
    },
    userInviteMatches,
    userInviteSearching,
    userInviteSelectedUserId,
    setUserInviteSelectedUserId,
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
    timerEnabled,
    setTimerEnabled,
    pickTimerSeconds,
    setPickTimerSeconds,
    availableLeagueMembers,
    ceremonyStartsAt,
    draftId,
    draftStatus,
    integrityWarningActive,
    addMember,
    removeMember,
    updateScoring,
    updateAllocation,
    updateTimer,
    updateTimerWith,
    createDraft,
    cancelSeason,
    transferSeasonOwnership,
    createUserInvite,
    createPlaceholderInvite,
    revokeInvite,
    regenerateInvite,
    saveInviteLabel,
    formatDate,
    buildInviteLink,
    copyLink,
    getCeremonyCategoriesForWeights
  };
}
