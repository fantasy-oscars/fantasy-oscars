import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Box, Text, VisuallyHidden } from "@ui";
import { useMediaQuery } from "@ui/hooks";
import type { ContenderPickerProps } from "@/features/contenders/ui/ContenderPicker";
import type { CircuitDraftView } from "@/orchestration/circuitDraft";
import type { DraftRoomOrchestration } from "@/orchestration/draft";
import {
  circuitBoardCategoryCards,
  circuitBoardRosters,
  circuitDraftLobbyFacts,
  circuitDraftRoundNote,
  circuitDraftStartNote,
  type CircuitDraftClockView,
  type CircuitQueueRow
} from "@/decisions/circuitDraft";
import {
  circuitDraftedBy,
  circuitDraftPreview,
  circuitHistoryRows,
  circuitMyRosterRows,
  circuitRoomHeader,
  circuitStagingNote
} from "@/decisions/circuitDraftRoom";
import { contenderPillView } from "@/decisions/contenderPill";
import type {
  DraftConnectionState,
  DraftConnectionView
} from "@/decisions/draft/connection";
import { pickDeterministicAvatarKey } from "@/decisions/avatars";
import {
  fullSeasonSettingsFrom,
  SETTINGS_AREA_TITLES
} from "@/decisions/fullSeasonSettings";
import { areaSummary } from "@/decisions/fullSeasonSummary";
import type { ApiResult, CircuitSelectionSummary } from "@/lib/types";
import { circuitLeaguePath } from "@/lib/routes";
import { FO_BP_MOBILE_MAX_PX } from "@/tokens/breakpoints";
import { RuntimeBannerStack } from "@/notifications";
import { SiteFooterFineprintOnly } from "@/app/layouts/SiteFooter";
import {
  CircuitPageError,
  CircuitPageSkeleton
} from "@/features/circuitLeagues/ui/CircuitPageFrame";
import {
  CircuitDraftBoard,
  type CircuitBoardMode
} from "@/features/circuitLeagues/ui/CircuitDraftBoard";
import { CircuitDraftLobby } from "@/features/circuitLeagues/ui/CircuitDraftLobby";
import { CircuitDraftPickPanel } from "@/features/circuitLeagues/ui/CircuitDraftPickPanel";
import {
  CircuitHistoryList,
  CircuitRosterList,
  type CircuitRailPick
} from "@/features/circuitLeagues/ui/CircuitDraftRailLists";
import {
  CircuitStagingPanel,
  type CircuitStagingDraft,
  type CircuitStagingList
} from "@/features/circuitLeagues/ui/CircuitStagingPanel";
import {
  ContenderCardModal,
  type ContenderCardContent
} from "@/features/circuitLeagues/ui/ContenderCardModal";
import {
  ContenderPill,
  ContenderPillCaption
} from "@/features/circuitLeagues/ui/ContenderPill";
import { useStagingGesture } from "@/features/circuitLeagues/screens/useStagingGesture";
import { DraftBoardHeader } from "@/features/draft/screens/DraftBoardHeader";
import { MobileDraftHeader } from "@/features/draft/screens/mobile/MobileDraftHeader";
import { useDraftAudioUnlock } from "@/features/draft/screens/useDraftAudioUnlock";
import { useDraftRailLayout } from "@/features/draft/screens/useDraftRailLayout";
import { useTurnStartChime } from "@/features/draft/screens/useTurnStartChime";
import { DraftConnectionIndicator } from "@/features/draft/ui/DraftConnectionIndicator";
import { DraftLiveRegion } from "@/features/draft/ui/DraftLiveRegion";
import { DraftRail } from "@/features/draft/ui/DraftRail";
import { DraftMobileRailBar } from "@/features/draft/ui/mobile/DraftMobileRailBar";

type RailPreferences = DraftRoomOrchestration["preferences"]["value"]["rails"];
type RailId = "ledger" | "roster" | "autodraft";

const NOT_JOINED = "You have not joined this season, so you can watch but not pick.";
const STAGING_TITLE = "Staging";

export type CircuitDraftScreenProps = {
  view: CircuitDraftView;
  viewerUserId: number | null;
  viewerLabel: string;
  viewerAvatarKey: string | null;
  /** The contender form with its Draft, Queue and Stage actions; null for non-members. */
  picker: ContenderPickerProps | null;
  connection: DraftConnectionView;
  connectionState: DraftConnectionState;
  clock: CircuitDraftClockView | null;
  pickStatus: ApiResult | null;
  picking: boolean;
  pauseStatus: ApiResult | null;
  onTogglePause: () => void;
  queueBusy: boolean;
  removingSelectionId: number | null;
  queueStatus: ApiResult | null;
  startStatus: ApiResult | null;
  onStart: () => void;
  onDraft: (selection: CircuitSelectionSummary) => Promise<boolean>;
  onRemoveFromQueue: (selectionId: number) => void;
  onReorderQueue: (selectionIds: number[]) => void;
  onQueue: (selection: CircuitSelectionSummary) => void;
  onStage: (selection: CircuitSelectionSummary) => void;
  onUnstage: (selectionId: number) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  railPreferences: RailPreferences;
  onRailOpenChange: (rail: RailId, open: boolean) => void;
};

/**
 * The season draft room, in the ceremony draft room's frame: the same header
 * (seats, round and pick, the clock, Start, Pause and Resume, the Draft and
 * Roster views, sounds), the draft history and roster rails, and the staging
 * rail (queue and staged contenders) where the ceremony room has auto-draft.
 * The contender form takes the nominee board's place. On a phone the rails
 * open from the bottom bar, as in the ceremony room.
 */
export function CircuitDraftScreen(props: CircuitDraftScreenProps) {
  const { view } = props;
  const isMobile = useMediaQuery(`(max-width: ${FO_BP_MOBILE_MAX_PX}px)`);
  const coarse = useMediaQuery("(pointer: coarse)");
  if (view.state === "loading") return <CircuitPageSkeleton label="Loading draft" />;
  if (view.state === "error") {
    return (
      <CircuitPageError
        title="Draft"
        notFound={view.notFound}
        message={view.message}
        requestId={view.requestId}
      />
    );
  }
  return (
    <CircuitDraftRoom
      {...props}
      view={view}
      isMobile={Boolean(isMobile)}
      phoneCard={Boolean(isMobile || coarse)}
    />
  );
}

function CircuitDraftRoom(
  props: CircuitDraftScreenProps & {
    view: Extract<CircuitDraftView, { state: "ready" }>;
    isMobile: boolean;
    /** Below 500 px or a coarse pointer: a tap on a pill opens the nominee card. */
    phoneCard: boolean;
  }
) {
  const { view } = props;
  const { detail, snapshot, phase } = view;
  const [boardView, setBoardView] = useState<"draft" | "roster">("draft");
  const [boardMode, setBoardMode] = useState<CircuitBoardMode>("player");
  const { audioControllerRef, audioUnlocked } = useDraftAudioUnlock();

  const header = useMemo(
    () =>
      circuitRoomHeader({
        snapshot,
        members: detail.members,
        viewerUserId: props.viewerUserId,
        clock: props.clock
      }),
    [snapshot, detail.members, props.viewerUserId, props.clock]
  );
  const isPre = header.status === "PENDING";
  const isPaused = header.status === "PAUSED";
  const isCompleted = header.status === "COMPLETED";
  const live = phase === "live" || phase === "paused";
  const participants = header.participants.map((p) => ({
    ...p,
    // Header tokens need an avatar key; fall back deterministically from the name.
    avatarKey: p.avatarKey ?? pickDeterministicAvatarKey(p.label)
  }));
  const avatarKeyBySeat = new Map(participants.map((p) => [p.seatNumber, p.avatarKey]));
  const mine = header.isMyTurn && header.status === "IN_PROGRESS";
  const showBoard = isCompleted || (live && boardView === "roster");
  const backHref = circuitLeaguePath({
    leagueId: detail.league.id,
    leagueName: detail.league.name,
    circuitLeagueId: detail.circuit_league.id
  });

  useTurnStartChime({
    running: header.status === "IN_PROGRESS",
    isMyTurn: header.isMyTurn,
    soundEnabled: props.soundEnabled,
    audioUnlocked,
    audioControllerRef
  });

  const historyRows = useMemo(
    () => (snapshot ? circuitHistoryRows(snapshot, detail.categories) : []),
    [snapshot, detail.categories]
  );
  const rosterRows = useMemo(
    () =>
      snapshot
        ? circuitMyRosterRows(snapshot, detail.categories, props.viewerUserId)
        : [],
    [snapshot, detail.categories, props.viewerUserId]
  );

  const categories = detail.categories;
  const viewOf = useCallback(
    (selection: CircuitSelectionSummary) => contenderPillView(selection, categories),
    [categories]
  );
  const draftedBy = useMemo(
    () => (snapshot ? circuitDraftedBy(snapshot, categories, detail.members) : new Map()),
    [snapshot, categories, detail.members]
  );
  const pickOf = useCallback(
    (row: { selection: CircuitSelectionSummary | null }): CircuitRailPick | null => {
      if (!row.selection) return null;
      const drafted = draftedBy.get(row.selection.id);
      return drafted ? { view: viewOf(row.selection), drafted } : null;
    },
    [draftedBy, viewOf]
  );

  const gesture = useStagingGesture({
    canPick: live && Boolean(view.gate?.canPick),
    picking: props.picking,
    draftedIds: draftedBy,
    onDraft: props.onDraft
  });
  const [card, setCard] = useState<ContenderCardContent | null>(null);
  const openPickCard = (pick: CircuitRailPick) =>
    setCard({ tooltip: pick.view.tooltip, drafted: pick.drafted, actions: [] });
  const openStagingCard = (row: CircuitQueueRow, list: CircuitStagingList) => {
    const close = (run: () => void) => () => {
      setCard(null);
      run();
    };
    const undrafted = !row.drafted;
    setCard({
      tooltip: viewOf(row.selection).tooltip,
      drafted: draftedBy.get(row.selection.id) ?? null,
      actions: [
        ...(gesture.canDraft && undrafted
          ? [
              {
                key: "draft",
                label: "Draft",
                primary: true,
                onClick: close(() => gesture.draft(row))
              }
            ]
          : []),
        ...(undrafted
          ? [
              list === "queue"
                ? {
                    key: "move",
                    label: "Move to staged",
                    onClick: close(() => props.onStage(row.selection))
                  }
                : {
                    key: "move",
                    label: "Add to queue",
                    onClick: close(() => props.onQueue(row.selection))
                  }
            ]
          : []),
        {
          key: "remove",
          label: "Remove",
          onClick: close(() =>
            list === "queue"
              ? props.onRemoveFromQueue(row.selection.id)
              : props.onUnstage(row.selection.id)
          )
        }
      ]
    });
  };

  const railCard = props.phoneCard ? openPickCard : undefined;

  const stagingDraft: CircuitStagingDraft | null =
    live && view.gate
      ? {
          canDraft: gesture.canDraft,
          note: circuitStagingNote({ gate: view.gate, phone: props.phoneCard }),
          armedId: gesture.armedId,
          pendingId: gesture.pendingId,
          onArm: gesture.arm,
          onDisarm: gesture.disarm,
          onDraft: gesture.draft
        }
      : null;

  const staging =
    view.queue && view.staged ? (
      <CircuitStagingPanel
        queue={view.queue}
        staged={view.staged}
        autoDraft={detail.circuit_league.auto_draft_enabled}
        busy={props.queueBusy}
        removingSelectionId={props.removingSelectionId}
        status={props.queueStatus}
        draft={stagingDraft}
        viewOf={viewOf}
        draftedBy={draftedBy}
        phone={props.phoneCard}
        onOpenCard={openStagingCard}
        onRemove={props.onRemoveFromQueue}
        onReorder={props.onReorderQueue}
        onStage={props.onStage}
        onQueue={props.onQueue}
        onUnstage={props.onUnstage}
      />
    ) : (
      <Text className="dr-railEmpty">
        You have not joined this season, so you have no queue.
      </Text>
    );

  const notes = [
    snapshot && live ? circuitDraftRoundNote(snapshot) : null,
    view.gate?.onTheClock && detail.circuit_league.auto_draft_enabled
      ? "If your clock runs out, your highest queued contender still available is drafted for you."
      : null
  ].filter((n): n is string => n !== null);

  const preview = props.picker
    ? circuitDraftPreview({
        category: props.picker.category,
        film: props.picker.film,
        person: props.picker.person,
        categories,
        snapshot,
        viewerUserId: props.viewerUserId
      })
    : null;
  const picker: ContenderPickerProps | null =
    props.picker && preview
      ? {
          ...props.picker,
          previewPill: (
            <Box className={["fo-pillScope", "circuit-previewPill"].join(" ")}>
              <ContenderPill
                label={preview.label}
                categoryName={preview.categoryName}
                iconCode={preview.iconCode}
                iconVariant={preview.iconVariant}
                state={preview.owned ? "muted" : "default"}
                stateSuffix={preview.stateSuffix}
              />
              {preview.caption ? (
                <ContenderPillCaption>{preview.caption}</ContenderPillCaption>
              ) : null}
            </Box>
          )
        }
      : props.picker;

  const middle = (
    <CircuitDraftPickPanel
      title={isPre ? "Prepare your picks" : "Your pick"}
      context={`${detail.circuit?.name ?? "Season"} · ${detail.league.name}`}
      reason={
        isPre
          ? detail.viewer.is_member
            ? "Queue and stage contenders now; you draft them once the draft starts."
            : "You have not joined this season, so you have no draft queue."
          : (view.gate?.reason ?? NOT_JOINED)
      }
      ready={view.gate?.canPick ?? false}
      notes={notes}
      statuses={isPre ? [] : [props.pickStatus, props.pauseStatus]}
      picker={picker}
    >
      {isPre ? (
        <CircuitDraftLobby
          startNote={circuitDraftStartNote({
            status: detail.circuit_league.status,
            canManage: detail.viewer.can_manage
          })}
          facts={circuitDraftLobbyFacts(detail.circuit_league)}
          summaries={(["events", "scoring", "roster"] as const).map((area) => ({
            title: SETTINGS_AREA_TITLES[area],
            ...areaSummary(
              area,
              fullSeasonSettingsFrom(detail),
              detail.events,
              detail.categories
            )
          }))}
          members={detail.members.map((m) => ({
            userId: m.user_id,
            username: m.username,
            avatarKey: m.avatar_key,
            isViewer: m.user_id === props.viewerUserId
          }))}
          startStatus={props.startStatus}
          blockedLine={view.startBlockedLine}
        />
      ) : null}
    </CircuitDraftPickPanel>
  );

  const board = snapshot ? (
    <Box
      className={["dr-middle", "circuit-roomBoard"].join(" ")}
      component="section"
      aria-label="Draft board"
      tabIndex={0}
    >
      <Box className={["circuit-roomPanel", "is-wide"].join(" ")}>
        {isCompleted ? (
          <Text className="baseline-textBody" role="status">
            The draft is complete. Rosters now change through waivers and free agency.
          </Text>
        ) : null}
        <CircuitDraftBoard
          mode={boardMode}
          onModeChange={setBoardMode}
          rosters={circuitBoardRosters(snapshot, detail.members, props.viewerUserId)}
          categories={circuitBoardCategoryCards(snapshot, categories, detail.members)}
          viewOf={(pick) => viewOf(pick.selection)}
          onOpenCard={
            props.phoneCard
              ? (pick) =>
                  setCard({
                    tooltip: viewOf(pick.selection).tooltip,
                    drafted: draftedBy.get(pick.selection.id) ?? null,
                    actions: []
                  })
              : undefined
          }
        />
      </Box>
    </Box>
  ) : null;

  const headerView: "draft" | "roster" = isPre
    ? "draft"
    : isCompleted
      ? "roster"
      : boardView;
  const canManageDraft = isPre ? view.canStart : view.canPause;
  const headerProps = {
    participants,
    direction: header.direction,
    roundNumber: header.roundNumber,
    pickNumber: header.pickNumber,
    isTimerDraft: header.hasTimer,
    timerRemainingMs: header.timerRemainingMs,
    clockText: header.clockText,
    draftStatus: header.status,
    isFinalResults: false,
    resultsPodium: [],
    view: headerView,
    onViewChange: setBoardView,
    canToggleView: live,
    showDrafted: false,
    onToggleShowDrafted: () => {},
    showDraftedVisible: false,
    showDraftControls: !isCompleted,
    canManageDraft,
    onStartDraft: props.onStart,
    startBlockedLine: view.startBlockedLine,
    onPauseDraft: props.onTogglePause,
    onResumeDraft: props.onTogglePause,
    audioController: audioControllerRef.current,
    audioUnlocked,
    isMyTurn: header.isMyTurn,
    userLabel: props.viewerLabel,
    userAvatarKey: props.viewerAvatarKey
  };

  const statusChrome = (
    <>
      <VisuallyHidden component="h1">
        {isPre ? "Draft lobby" : "Draft room"}
      </VisuallyHidden>
      <DraftLiveRegion
        message={view.announcement}
        connectionState={props.connectionState}
      />
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {gesture.clearedNote ?? ""}
      </VisuallyHidden>
      <DraftConnectionIndicator connection={props.connection} />
    </>
  );

  const frame = (headerNode: ReactNode, body: ReactNode, bar: ReactNode = null) => (
    <Box
      className="dr-frame"
      data-screen="circuit-draft-room"
      data-turn={mine ? "mine" : "theirs"}
      data-results="live"
      data-mobile={props.isMobile ? "true" : undefined}
    >
      {statusChrome}
      {headerNode}
      <RuntimeBannerStack />
      <Box component="main" id="main-content" tabIndex={-1} className="dr-body">
        {body}
      </Box>
      {bar}
      <Box component="footer" className="dr-footer">
        <SiteFooterFineprintOnly />
      </Box>
      <ContenderCardModal card={card} onClose={() => setCard(null)} />
    </Box>
  );

  if (props.isMobile) {
    return (
      <MobileRoom
        frame={frame}
        headerProps={{ ...headerProps, backHref }}
        isPre={isPre}
        showBoard={showBoard}
        board={board}
        middle={middle}
        history={
          <CircuitHistoryList
            rows={historyRows}
            avatarKeyBySeat={avatarKeyBySeat}
            pickOf={pickOf}
            onOpenCard={railCard}
          />
        }
        roster={
          <CircuitRosterList rows={rosterRows} pickOf={pickOf} onOpenCard={railCard} />
        }
        staging={staging}
      />
    );
  }

  return frame(
    <DraftBoardHeader
      {...headerProps}
      backHref={backHref}
      showDraftedFilter={false}
      soundEnabled={props.soundEnabled}
      onToggleSound={props.onToggleSound}
      showCursorSpyToggle={false}
      cursorSpyUserEnabled={false}
      onToggleCursorSpy={() => {}}
      onParticipantHoverSeat={() => {}}
    />,
    showBoard ? (
      board
    ) : (
      <DesktopRails
        isPre={isPre}
        isLiveOrPaused={isPaused || header.status === "IN_PROGRESS"}
        railPreferences={props.railPreferences}
        onRailOpenChange={props.onRailOpenChange}
        history={
          <CircuitHistoryList
            rows={historyRows}
            avatarKeyBySeat={avatarKeyBySeat}
            pickOf={pickOf}
            onOpenCard={railCard}
          />
        }
        roster={
          <CircuitRosterList rows={rosterRows} pickOf={pickOf} onOpenCard={railCard} />
        }
        staging={staging}
        middle={middle}
      />
    )
  );
}

function DesktopRails(props: {
  isPre: boolean;
  isLiveOrPaused: boolean;
  railPreferences: RailPreferences;
  onRailOpenChange: (rail: RailId, open: boolean) => void;
  history: ReactNode;
  roster: ReactNode;
  staging: ReactNode;
  middle: ReactNode;
}) {
  const rails = useDraftRailLayout({
    isPre: props.isPre,
    isLiveOrPaused: props.isLiveOrPaused,
    railPreferences: props.railPreferences,
    onRailOpenChange: props.onRailOpenChange
  });
  return (
    <Box ref={rails.layoutRef} className="dr-layout">
      <DraftRail
        kind="ledger"
        open={rails.ledgerOpen}
        setOpen={rails.setLedgerOpen}
        icon="history"
        title="Draft history"
        side="left"
        disabled={props.isPre}
        disabledTitle="Draft history (available after draft starts)"
        compactRails={rails.compactRails}
        openExclusive={() => rails.openRailExclusive("ledger")}
      >
        {props.history}
      </DraftRail>
      {props.middle}
      <DraftRail
        kind="roster"
        open={rails.myRosterOpen}
        setOpen={rails.setMyRosterOpen}
        icon="patient_list"
        title="My roster"
        side="right"
        disabled={props.isPre}
        disabledTitle="My roster (available after draft starts)"
        compactRails={rails.compactRails}
        openExclusive={() => rails.openRailExclusive("roster")}
      >
        {props.roster}
      </DraftRail>
      <DraftRail
        kind="autodraft"
        open={rails.autoDraftOpen}
        setOpen={rails.setAutoDraftOpen}
        icon="star"
        title={STAGING_TITLE}
        side="right"
        compactRails={rails.compactRails}
        openExclusive={() => rails.openRailExclusive("auto")}
      >
        {props.staging}
      </DraftRail>
    </Box>
  );
}

function MobileRoom(props: {
  frame: (header: ReactNode, body: ReactNode, bar?: ReactNode) => ReactNode;
  headerProps: Omit<
    Parameters<typeof MobileDraftHeader>[0],
    "open" | "onOpen" | "onClose"
  >;
  isPre: boolean;
  showBoard: boolean;
  board: ReactNode;
  middle: ReactNode;
  history: ReactNode;
  roster: ReactNode;
  staging: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeRail, setActiveRail] = useState<RailId | null>(null);
  const titles: Record<RailId, string> = {
    ledger: "Draft history",
    roster: "My roster",
    autodraft: STAGING_TITLE
  };
  const content: Record<RailId, ReactNode> = {
    ledger: props.history,
    roster: props.roster,
    autodraft: props.staging
  };
  const rail = props.isPre && activeRail !== "autodraft" ? null : activeRail;
  const body = props.showBoard ? (
    props.board
  ) : rail ? (
    <Box className="dr-mobileScroll">
      <Box
        className="dr-mobileRailPane"
        component="section"
        aria-labelledby="circuit-mobile-rail-title"
      >
        <Text className="dr-railPaneTitle" id="circuit-mobile-rail-title">
          {titles[rail]}
        </Text>
        {content[rail]}
      </Box>
    </Box>
  ) : (
    props.middle
  );
  return props.frame(
    <MobileDraftHeader
      {...props.headerProps}
      open={menuOpen}
      onOpen={() => setMenuOpen(true)}
      onClose={() => setMenuOpen(false)}
    />,
    body,
    props.showBoard ? null : (
      <DraftMobileRailBar
        activeRail={rail}
        onToggle={(id) => setActiveRail((r) => (r === id ? null : id))}
        rails={[
          {
            id: "ledger",
            icon: "history",
            label: "Draft history",
            enabled: !props.isPre,
            title: props.isPre
              ? "Draft history (available after draft starts)"
              : "Draft history"
          },
          {
            id: "roster",
            icon: "patient_list",
            label: "My roster",
            enabled: !props.isPre,
            title: props.isPre ? "My roster (available after draft starts)" : "My roster"
          },
          { id: "autodraft", icon: "star", label: STAGING_TITLE, enabled: true }
        ]}
      />
    )
  );
}
