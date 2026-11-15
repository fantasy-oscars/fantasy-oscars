import { Box } from "@ui";
import { useMemo, useRef, useState } from "react";
import {
  computeHeaderStatus,
  isHeaderCountdownRunning
} from "@/decisions/draft/headerStatus";
import { DraftHeaderTab } from "@/features/draft/ui/DraftHeaderTab";
import { DraftHeaderLeftWing } from "@/features/draft/ui/DraftHeaderLeftWing";
import { DraftHeaderMeasureRow } from "@/features/draft/ui/DraftHeaderMeasureRow";
import { DraftHeaderRightWing } from "@/features/draft/ui/DraftHeaderRightWing";
import type { createDraftAudioController } from "@/lib/draftAudio";
import { resolvePodium } from "@/decisions/draft/podium";
import { useCountdownPhase } from "@/orchestration/draft/useCountdownPhase";
import { useHeaderCompaction } from "./useHeaderCompaction";
import { useParticipantStripLayout } from "./useParticipantStripLayout";

export function DraftBoardHeader(props: {
  backHref: string | null;
  participants: Array<{
    seatNumber: number;
    label: string;
    active: boolean;
    avatarKey: string;
  }>;
  direction: "FORWARD" | "REVERSE" | null;
  roundNumber: number | null;
  pickNumber: number | null;
  isTimerDraft: boolean;
  timerRemainingMs: number | null;
  clockText: string;
  draftStatus: string | null;
  isFinalResults: boolean;
  resultsPodium: Array<{ place: 1 | 2 | 3; names: string[] }>;
  view: "draft" | "roster";
  onViewChange: (v: "draft" | "roster") => void;
  canToggleView: boolean;
  showDrafted: boolean;
  onToggleShowDrafted: (next: boolean) => void;
  showDraftedVisible: boolean;
  showDraftControls: boolean;
  canManageDraft: boolean;
  onStartDraft: () => void;
  onPauseDraft: () => void;
  onResumeDraft: () => void;
  audioController: ReturnType<typeof createDraftAudioController>;
  audioUnlocked: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isMyTurn: boolean;
  showCursorSpyToggle: boolean;
  cursorSpyUserEnabled: boolean;
  onToggleCursorSpy: () => void;
  userLabel: string;
  userAvatarKey: string | null;
  onParticipantHoverSeat: (seatNumber: number | null) => void;
}) {
  const isPre = props.draftStatus === "PENDING";
  const isPaused = props.draftStatus === "PAUSED";
  const isCompleted = props.draftStatus === "COMPLETED";

  const headerRef = useRef<HTMLDivElement | null>(null);
  const leftMeasureRef = useRef<HTMLDivElement | null>(null);
  const rightMeasureRef = useRef<HTMLDivElement | null>(null);
  const participantStripRef = useRef<HTMLDivElement | null>(null);
  const participantStripMeasureRef = useRef<HTMLDivElement | null>(null);
  const compactHeader = useHeaderCompaction({
    headerRef,
    leftMeasureRef,
    rightMeasureRef
  });
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);

  const activeIndexRaw = props.participants.findIndex((p) => p.active);
  const activeIndex = activeIndexRaw >= 0 ? activeIndexRaw : 0;
  const activeLabel = props.participants[activeIndex]?.label ?? "—";
  const participantStripBase = useParticipantStripLayout({
    containerRef: participantStripRef,
    participants: props.participants,
    activeIndex,
    direction: props.direction,
    suppressActive: isPre || isPaused || isCompleted
  });
  const participantStripLayout = {
    containerRef: participantStripRef,
    ...participantStripBase
  };
  const participantStripMeasureLayout = {
    containerRef: participantStripMeasureRef,
    ...participantStripBase
  };

  const podium = useMemo(() => resolvePodium(props.resultsPodium), [props.resultsPodium]);

  const countdownActive = isHeaderCountdownRunning({
    isTimerDraft: props.isTimerDraft,
    draftStatus: props.draftStatus,
    isFinalResults: props.isFinalResults,
    isMyTurn: props.isMyTurn,
    timerRemainingMs: props.timerRemainingMs
  });

  const countdownPhase = useCountdownPhase({
    active: countdownActive,
    canBeep: Boolean(props.soundEnabled && props.audioUnlocked && props.isMyTurn),
    audioController: props.audioController
  });

  const status = computeHeaderStatus({
    draftStatus: props.draftStatus,
    isFinalResults: props.isFinalResults,
    hasPodium: podium.length > 0,
    isTimerDraft: props.isTimerDraft,
    isMyTurn: props.isMyTurn,
    countdownActive,
    countdownPhase,
    timerRemainingMs: props.timerRemainingMs,
    clockText: props.clockText,
    activeLabel
  });

  return (
    <Box component="header" className="dr-header">
      <Box className="drh-row" ref={headerRef}>
        <Box className="drh-left">
          <Box className="drh-wing">
            <DraftHeaderLeftWing
              compactHeader={compactHeader}
              compactMenuOpen={compactMenuOpen}
              setCompactMenuOpen={setCompactMenuOpen}
              backHref={props.backHref}
              isCompleted={isCompleted}
              isPre={isPre}
              isPaused={isPaused}
              participants={props.participants}
              activeIndex={activeIndex}
              direction={props.direction}
              participantStripLayout={participantStripLayout}
              view={props.view}
              onViewChange={props.onViewChange}
              canToggleView={props.canToggleView}
              onParticipantHoverSeat={props.onParticipantHoverSeat}
            />
          </Box>
        </Box>

        <DraftHeaderTab
          status={status}
          roundNumber={props.roundNumber}
          pickNumber={props.pickNumber}
          podium={podium}
        />

        <Box className="drh-right">
          <Box className="drh-wing drh-wingRight">
            <DraftHeaderRightWing
              compactHeader={compactHeader}
              showDraftControls={props.showDraftControls}
              canManageDraft={props.canManageDraft}
              isPre={isPre}
              isPaused={isPaused}
              isCompleted={isCompleted}
              view={props.view}
              onViewChange={props.onViewChange}
              canToggleView={props.canToggleView}
              showDrafted={props.showDrafted}
              onToggleShowDrafted={props.onToggleShowDrafted}
              showDraftedVisible={props.showDraftedVisible}
              onStartDraft={props.onStartDraft}
              onPauseDraft={props.onPauseDraft}
              onResumeDraft={props.onResumeDraft}
              soundEnabled={props.soundEnabled}
              onToggleSound={props.onToggleSound}
              showCursorSpyToggle={props.showCursorSpyToggle}
              cursorSpyUserEnabled={props.cursorSpyUserEnabled}
              onToggleCursorSpy={props.onToggleCursorSpy}
              userLabel={props.userLabel}
              userAvatarKey={props.userAvatarKey}
            />
          </Box>
        </Box>

        {/* Hidden measurement row: keeps compact/non-compact switching stable by measuring the real non-compact wings even when compact is active. */}
        <DraftHeaderMeasureRow
          leftMeasureRef={leftMeasureRef}
          rightMeasureRef={rightMeasureRef}
          participantStripLayout={participantStripMeasureLayout}
          isCompleted={isCompleted}
          isPre={isPre}
          isPaused={isPaused}
          showDraftControls={props.showDraftControls}
          canManageDraft={props.canManageDraft}
          participants={props.participants}
          activeIndex={activeIndex}
          direction={props.direction}
          view={props.view}
          canToggleView={props.canToggleView}
          showDraftedVisible={props.showDraftedVisible}
          showDrafted={props.showDrafted}
          showCursorSpyToggle={props.showCursorSpyToggle}
          userLabel={props.userLabel}
          userAvatarKey={props.userAvatarKey}
        />
      </Box>
    </Box>
  );
}
