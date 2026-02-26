import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import type { ApiResult, Snapshot } from "../../lib/types";
import {
  buildDraftedSet,
  buildIconByCategoryId,
  buildNominationsByCategoryId,
  computeDraftBoardCols,
  type DraftRoomView,
  type PoolMode
} from "../../decisions/draft";
import type { DraftRoomOrchestration } from "./orchestration";

type DraftBoardCategory = NonNullable<Snapshot["categories"]>[number];
type DraftBoardNomination = NonNullable<Snapshot["nominations"]>[number];

export function useDraftPreviewOrchestration(args: {
  ceremonyId: number | null;
}): DraftRoomOrchestration {
  const { ceremonyId } = args;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<DraftBoardCategory[]>([]);
  const [nominations, setNominations] = useState<DraftBoardNomination[]>([]);

  const [view, setView] = useState<DraftRoomView>("draft");
  const [poolMode, setPoolMode] = useState<PoolMode>("ALL_MUTED");
  const [autodraftCollapsed, setAutodraftCollapsed] = useState(false);

  const load = useCallback(
    async (options?: { preserve?: boolean }) => {
      if (!ceremonyId || !Number.isFinite(ceremonyId) || ceremonyId <= 0) {
        setError("Invalid ceremony id");
        return false;
      }
      setLoading(true);
      setError(null);
      if (!options?.preserve) {
        setCategories([]);
        setNominations([]);
      }
      const res = await fetchJson<{
        categories: DraftBoardCategory[];
        nominations: DraftBoardNomination[];
      }>(`/admin/ceremonies/${ceremonyId}/draft-board`, { method: "GET" });
      setLoading(false);
      if (!res.ok) {
        setError(res.error ?? "Failed to load draft board");
        return false;
      }
      setCategories(res.data?.categories ?? []);
      setNominations(res.data?.nominations ?? []);
      return true;
    },
    [ceremonyId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load({ preserve: true });
  }, [load]);

  const snapshot = useMemo<Snapshot | null>(() => {
    if (!ceremonyId || !Number.isFinite(ceremonyId) || ceremonyId <= 0) return null;
    return {
      draft: {
        id: 0,
        league_id: 0,
        season_id: 0,
        status: "PENDING"
      },
      seats: [],
      picks: [],
      version: 0,
      categories,
      nominations
    };
  }, [categories, ceremonyId, nominations]);

  const drafted = useMemo(() => buildDraftedSet([]), []);
  const iconByCategoryId = useMemo(() => buildIconByCategoryId(snapshot), [snapshot]);
  const nominationsByCategoryId = useMemo(
    () => buildNominationsByCategoryId(snapshot),
    [snapshot]
  );

  const rails = useMemo(() => {
    const showAutodraft = !autodraftCollapsed;
    return { showLedger: false, showRoster: false, showAutodraft };
  }, [autodraftCollapsed]);

  const boardCols = useMemo(
    () =>
      computeDraftBoardCols({
        hasSnapshot: Boolean(snapshot),
        showLedger: "hidden",
        showRoster: "hidden",
        showAutodraft: rails.showAutodraft
          ? autodraftCollapsed
            ? "collapsed"
            : "open"
          : "hidden"
      }),
    [autodraftCollapsed, rails.showAutodraft, snapshot]
  );

  const poolCategories = useMemo(() => {
    if (!snapshot) return [];
    const cats = snapshot.categories ?? [];
    return cats.map((c) => {
      const rows = nominationsByCategoryId.get(c.id) ?? [];
      const active = rows.filter((n) => n.status === "ACTIVE");
      const filtered =
        poolMode === "UNDRAFTED_ONLY" ? active.filter((n) => !drafted.has(n.id)) : active;
      const icon = iconByCategoryId.get(c.id) ?? "";
      const iconVariant =
        (c as { icon_variant?: "default" | "inverted" | null }).icon_variant ?? "default";
      const nominations = filtered.map((n) => ({
        id: n.id,
        label: n.label,
        posterUrl: (n as { film_poster_url?: string | null }).film_poster_url ?? null,
        filmTitle: (n as { film_title?: string | null }).film_title ?? null,
        filmYear: (n as { film_year?: number | null }).film_year ?? null,
        contributors: (n as { contributors?: string[] }).contributors ?? [],
        songTitle: (n as { song_title?: string | null }).song_title ?? null,
        performerName: (n as { performer_name?: string | null }).performer_name ?? null,
        performerCharacter:
          (n as { performer_character?: string | null }).performer_character ?? null,
        performerProfileUrl:
          (n as { performer_profile_url?: string | null }).performer_profile_url ?? null,
        performerProfilePath:
          (n as { performer_profile_path?: string | null }).performer_profile_path ??
          null,
        muted: poolMode === "ALL_MUTED" && drafted.has(n.id),
        selected: false,
        winner: false
      }));
      return {
        id: c.id,
        title: c.family_name,
        icon,
        iconVariant,
        unitKind: String(c.unit_kind ?? ""),
        weight: null,
        nominations,
        emptyText: nominations.length ? null : "No nominees."
      };
    });
  }, [drafted, iconByCategoryId, nominationsByCategoryId, poolMode, snapshot]);

  const status: ApiResult | null = null;

  return {
    state: {
      loadingInitial: Boolean(loading && !snapshot),
      refreshing: Boolean(loading && snapshot),
      error
    },
    nav: {
      backToSeasonHref: null
    },
    header: {
      participants: [
        { seatNumber: 1, label: "Alice", active: true, avatarKey: "gorilla" },
        { seatNumber: 2, label: "Bob", active: false, avatarKey: "bird" },
        { seatNumber: 3, label: "Cathy", active: false, avatarKey: "cat" },
        { seatNumber: 4, label: "Donald", active: false, avatarKey: "dog" },
        { seatNumber: 5, label: "Emily", active: false, avatarKey: "elephant" }
      ],
      status: "IN_PROGRESS",
      roundNumber: 1,
      pickNumber: 1,
      direction: "FORWARD",
      hasTimer: true,
      clockText: "1:23",
      timerRemainingMs: null,
      poolMode,
      setPoolMode,
      view,
      setView,
      canToggleView: true,
      canStartDraft: false,
      startDisabled: true,
      startLoading: false,
      startResult: status,
      onStartDraft: () => {},
      canManageDraft: true,
      pauseLoading: false,
      pauseResult: null,
      onPauseDraft: () => {},
      resumeLoading: false,
      resumeResult: null,
      onResumeDraft: () => {},
      ceremonyStatus: null,
      isFinalResults: false,
      resultsWinnerLabel: null,
      resultsPodium: [],
      scoringStrategyName: "fixed",
      getNominationPoints: () => 1
    },
    layout: {
      phase: "LIVE",
      showRosterOnly: false,
      boardCols,
      rails: {
        ledger: {
          visible: false,
          collapsed: true,
          hide: () => {},
          show: () => {}
        },
        myRoster: {
          visible: false,
          collapsed: true,
          hide: () => {},
          show: () => {}
        },
        autodraft: {
          visible: !autodraftCollapsed,
          collapsed: autodraftCollapsed,
          hide: () => setAutodraftCollapsed(true),
          show: () => setAutodraftCollapsed(false)
        }
      }
    },
    ledger: { rows: [] },
    pool: {
      categories: poolCategories,
      onSelectNomination: () => {},
      selectable: false
    },
    myRoster: {
      seatNumber: null,
      picks: [],
      selected: null,
      clearSelection: () => {},
      canPick: false,
      pickDisabledReason: "Preview mode",
      pickLoading: false,
      pickState: null,
      submitPick: () => {},
      submitPickNomination: () => {}
    },
    rosterBoard: {
      seats: [],
      maxRows: 0,
      rowsBySeat: new Map(),
      emptyText: "Roster view is available once the draft starts."
    },
    autodraft: {
      enabled: false,
      setEnabled: () => {},
      strategy: "random",
      setStrategy: () => {},
      plans: [],
      selectedPlanId: null,
      setSelectedPlanId: () => {},
      list: [],
      loading: false,
      saving: false,
      error: null
    },
    refresh
  };
}
