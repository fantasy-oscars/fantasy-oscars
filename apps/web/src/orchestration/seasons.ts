import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../lib/api";
import { isIntegrityWarningWindow } from "../lib/draft";
import { notify } from "../notifications";
import type {
  ApiResult,
  CeremonySummary,
  LeagueDetail,
  LeagueMember,
  LeagueSummary,
  SeasonInvite,
  SeasonMember,
  SeasonMeta,
  SeasonSummary
} from "../lib/types";

export type LeagueSeasonCreateView =
  | { state: "loading" }
  | { state: "forbidden"; message: string }
  | { state: "error"; message: string }
  | {
      state: "ready";
      league: LeagueDetail;
      ceremonies: CeremonySummary[];
      working: boolean;
      status: ApiResult | null;
      ceremonyId: number | null;
      scoringStrategy: "fixed" | "negative";
      remainderStrategy: "UNDRAFTED" | "FULL_POOL";
      timerEnabled: boolean;
      pickTimerSeconds: number;
      canSubmit: boolean;
    };

export function useLeagueSeasonCreateOrchestration(input: { leagueId: number }) {
  const { leagueId } = input;

  const [state, setState] = useState<"loading" | "error" | "ready" | "forbidden">(
    "loading"
  );
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [ceremonies, setCeremonies] = useState<CeremonySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);

  const [ceremonyId, setCeremonyId] = useState<number | null>(null);
  const [scoringStrategy, setScoringStrategy] = useState<"fixed" | "negative">("fixed");
  const [remainderStrategy, setRemainderStrategy] = useState<"UNDRAFTED" | "FULL_POOL">(
    "UNDRAFTED"
  );
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [pickTimerSeconds, setPickTimerSeconds] = useState(60);

  const refresh = useCallback(async () => {
    if (!Number.isFinite(leagueId) || leagueId <= 0) {
      setState("error");
      setError("Invalid league id");
      return;
    }

    setState("loading");
    setError(null);

    const [leagueRes, ceremoniesRes] = await Promise.all([
      fetchJson<{ league: LeagueDetail }>(`/leagues/${leagueId}`, { method: "GET" }),
      fetchJson<{ ceremonies: CeremonySummary[] }>(`/ceremonies/published`, {
        method: "GET"
      })
    ]);

    if (!leagueRes.ok || !leagueRes.data?.league) {
      setError(leagueRes.error ?? "Unable to load league");
      setState(leagueRes.errorCode === "FORBIDDEN" ? "forbidden" : "error");
      return;
    }

    setLeague(leagueRes.data.league);
    setCeremonies(ceremoniesRes.ok ? (ceremoniesRes.data?.ceremonies ?? []) : []);
    setState("ready");
  }, [leagueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canSubmit = useMemo(() => {
    return (
      state === "ready" &&
      !working &&
      Number.isFinite(ceremonyId) &&
      (ceremonyId ?? 0) > 0
    );
  }, [ceremonyId, state, working]);

  const submit = useCallback(async () => {
    if (!Number.isFinite(leagueId) || leagueId <= 0) return { ok: false as const };
    if (!ceremonyId) return { ok: false as const };
    if (!Number.isFinite(ceremonyId) || ceremonyId <= 0) return { ok: false as const };

    setWorking(true);
    setStatus(null);
    const res = await fetchJson<{ season: { id: number } }>(
      `/leagues/${leagueId}/seasons`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ceremony_id: ceremonyId,
          scoring_strategy_name: scoringStrategy,
          remainder_strategy: remainderStrategy,
          pick_timer_seconds: timerEnabled ? pickTimerSeconds : null
        })
      }
    );
    setWorking(false);

    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to create season" });
      return { ok: false as const };
    }

    const seasonId = res.data?.season?.id;
    if (!seasonId) {
      setStatus({ ok: false, message: "Season created, but response was missing id" });
      return { ok: false as const };
    }

    notify({
      id: "season.create.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Season created"
    });
    setStatus(null);
    return { ok: true as const, seasonId };
  }, [
    ceremonyId,
    leagueId,
    pickTimerSeconds,
    remainderStrategy,
    scoringStrategy,
    timerEnabled
  ]);

  const reset = useCallback(() => {
    setCeremonyId(null);
    setScoringStrategy("fixed");
    setRemainderStrategy("UNDRAFTED");
    setTimerEnabled(true);
    setPickTimerSeconds(60);
    setStatus(null);
  }, []);

  const view: LeagueSeasonCreateView =
    state === "loading"
      ? { state: "loading" }
      : state === "forbidden"
        ? { state: "forbidden", message: error ?? "Access denied" }
        : state === "error"
          ? { state: "error", message: error ?? "Unexpected error" }
          : {
              state: "ready",
              league: league ?? ({ id: leagueId, name: "", code: "" } as LeagueDetail),
              ceremonies,
              working,
              status,
              ceremonyId,
              scoringStrategy,
              remainderStrategy,
              timerEnabled,
              pickTimerSeconds,
              canSubmit
            };

  return {
    view,
    actions: {
      refresh,
      setCeremonyId,
      setScoringStrategy,
      setRemainderStrategy,
      setTimerEnabled,
      setPickTimerSeconds,
      reset,
      submit
    }
  };
}

export type SeasonsIndexRow = { league: LeagueSummary; seasons: SeasonSummary[] };
export type SeasonsIndexView =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; rows: SeasonsIndexRow[] };

export function useSeasonsIndexOrchestration() {
  const [view, setView] = useState<SeasonsIndexView>({ state: "loading" });

  const refresh = useCallback(async () => {
    setView({ state: "loading" });

    const leaguesRes = await fetchJson<{ leagues: LeagueSummary[] }>("/leagues");
    if (!leaguesRes.ok) {
      setView({ state: "error", message: leaguesRes.error ?? "Failed to load leagues" });
      return;
    }

    const leagues = leaguesRes.data?.leagues ?? [];
    const rows = await Promise.all(
      leagues.map(async (league) => {
        const res = await fetchJson<{ seasons: SeasonSummary[] }>(
          `/leagues/${league.id}/seasons`
        );
        return { league, seasons: res.ok ? (res.data?.seasons ?? []) : [] };
      })
    );

    setView({ state: "ready", rows });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { view, refresh };
}

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

        // Ceremony status drives small bits of UI copy (e.g. "View results" once COMPLETE).
        // We intentionally keep this lightweight (no draft board payload).
        const ceremoniesRes = await fetchJson<{ ceremonies: CeremonySummary[] }>("/ceremonies", {
          method: "GET"
        });
        const status =
          ceremoniesRes.ok && ceremoniesRes.data?.ceremonies
            ? ceremoniesRes.data.ceremonies.find((c) => c.id === found!.season.ceremony_id)
                ?.status ?? null
            : null;
        if (!cancelled) setCeremonyStatus(status);
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
      draft: { id: number; pick_timer_seconds: number | null; auto_pick_strategy: string | null };
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
    notify({
      id: "season.invite.link.copy.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Link copied"
    });
    setInviteResult(null);
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
    copyLink
  };
}
