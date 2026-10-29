import type { ApiResult, Snapshot } from "../../lib/types";
import type { DraftRoomView, PoolMode } from "../../decisions/draft";

export type DraftRoomOrchestration = {
  state: {
    loadingInitial: boolean;
    refreshing: boolean;
    error: string | null;
  };
  nav: {
    backToSeasonHref: string | null;
  };
  header: {
    participants: Array<{
      seatNumber: number;
      label: string;
      active: boolean;
      avatarKey: string | null;
      userId?: number | null;
    }>;
    status: Snapshot["draft"]["status"] | null;
    roundNumber: number | null;
    pickNumber: number | null;
    direction: "FORWARD" | "REVERSE" | null;
    hasTimer: boolean;
    clockText: string;
    timerRemainingMs: number | null;
    poolMode: PoolMode;
    setPoolMode: (m: PoolMode) => void;
    view: DraftRoomView;
    setView: (v: DraftRoomView) => void;
    canToggleView: boolean;
    canStartDraft: boolean;
    startDisabled?: boolean;
    startLoading: boolean;
    startResult: ApiResult | null;
    onStartDraft: () => void;
    canManageDraft: boolean;
    pauseLoading: boolean;
    pauseResult: ApiResult | null;
    onPauseDraft: () => void;
    resumeLoading: boolean;
    resumeResult: ApiResult | null;
    onResumeDraft: () => void;
    ceremonyStatus: string | null;
    isFinalResults: boolean;
    resultsWinnerLabel: string | null;
    resultsPodium: Array<{
      place: 1 | 2 | 3;
      names: string[];
    }>;
    scoringStrategyName: string;
    getNominationPoints: (nominationId: number) => number;
  };
  layout: {
    phase: "PRE" | "LIVE" | "POST";
    showRosterOnly: boolean;
    boardCols: string;
    rails: {
      ledger: {
        present?: boolean;
        visible?: boolean;
        collapsed: boolean;
        hide: () => void;
        show: () => void;
      };
      myRoster: {
        present?: boolean;
        visible?: boolean;
        collapsed: boolean;
        hide: () => void;
        show: () => void;
      };
      autodraft: {
        present?: boolean;
        visible?: boolean;
        collapsed: boolean;
        hide: () => void;
        show: () => void;
      };
    };
  };
  ledger: {
    rows: Array<{
      pickNumber: number;
      roundPick: string;
      seatNumber: number | null;
      seatLabel: string;
      nominationId: number | null;
      icon: string | null;
      label: string;
      active: boolean;
      winner: boolean;
    }>;
  };
  pool: {
    categories: Array<{
      id: number;
      title: string;
      icon: string;
      iconVariant?: "default" | "inverted";
      unitKind?: string;
      weight?: number | null;
      nominations: Array<{
        id: number;
        label: string;
        posterUrl?: string | null;
        filmTitle?: string | null;
        filmYear?: number | null;
        contributors?: string[];
        performerContributors?: Array<{
          fullName: string;
          roleLabel: string | null;
          profileUrl: string | null;
          profilePath: string | null;
          sortOrder: number;
        }>;
        songTitle?: string | null;
        performerName?: string | null;
        performerCharacter?: string | null;
        performerProfileUrl?: string | null;
        performerProfilePath?: string | null;
        muted: boolean;
        selected: boolean;
        winner: boolean;
      }>;
      emptyText: string | null;
    }>;
    onSelectNomination: (id: number) => void;
    selectable?: boolean;
  };
  myRoster: {
    seatNumber: number | null;
    picks: Array<{
      pickNumber: number;
      roundPick: string;
      nominationId: number;
      icon: string | null;
      label: string;
      winner: boolean;
    }>;
    selected: { id: number; icon: string | null; label: string } | null;
    clearSelection: () => void;
    canPick: boolean;
    pickDisabledReason: string | null;
    pickLoading: boolean;
    pickState: ApiResult | null;
    submitPick: () => void;
    submitPickNomination: (nominationId: number) => void;
  };
  rosterBoard: {
    seats: Array<{ seatNumber: number; username: string | null; winnerCount: number }>;
    maxRows: number;
    rowsBySeat: Map<
      number,
      Array<{
        pickNumber: number;
        nominationId: number;
        icon: string | null;
        label: string;
        winner: boolean;
      }>
    >;
    emptyText: string | null;
  };
  autodraft: {
    enabled: boolean;
    setEnabled: (v: boolean) => void;
    strategy: "random" | "by_category" | "alphabetical" | "wisdom" | "custom";
    setStrategy: (
      v: "random" | "by_category" | "alphabetical" | "wisdom" | "custom"
    ) => void;
    plans: Array<{ id: number; name: string }>;
    selectedPlanId: number | null;
    setSelectedPlanId: (v: number | null) => void;
    list: Array<{ nominationId: number; icon: string | null; label: string }>;
    loading: boolean;
    saving: boolean;
    error: string | null;
  };
  cursorSpy: {
    enabled: boolean;
    cursors: Array<{
      userId: number;
      seatNumber: number | null;
      label: string;
      avatarKey: string | null;
      x: number;
      y: number;
    }>;
    emit: (x: number, y: number) => void;
  };
  refresh: () => void;
};
