import { Box } from "@ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DRAFT_BUCKLE_MAX_PX,
  DRAFT_BUCKLE_MIN_PX,
  DRAFT_BUCKLE_VW_FRACTION,
  DRAFT_HEADER_HYSTERESIS_ENTER_PX,
  DRAFT_HEADER_HYSTERESIS_EXIT_PX,
  DRAFT_HEADER_NONCOMPACT_EXTRA_PX,
  DRAFT_HEADER_SIDE_PADDING_PX
} from "@/tokens/draftHeader";
import { CenterBuckle } from "@/features/draft/ui/CenterBuckle";
import { DraftHeaderLeftWing } from "@/features/draft/ui/DraftHeaderLeftWing";
import { DraftHeaderMeasureRow } from "@/features/draft/ui/DraftHeaderMeasureRow";
import { DraftHeaderRightWing } from "@/features/draft/ui/DraftHeaderRightWing";
import { createDraftAudioController, playCountdownBeep } from "@/lib/draftAudio";
import { COUNTDOWN_BEEP_INTERVAL_MS, isCountdownActive } from "@/lib/draftCountdown";
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
  resultsWinnerLabel: string | null;
  resultsPodium: Array<{ place: 1 | 2 | 3; names: string[] }>;
  view: "draft" | "roster";
  onViewChange: (v: "draft" | "roster") => void;
  canToggleView: boolean;
  showDrafted: boolean;
  onToggleShowDrafted: (next: boolean) => void;
  showDraftedVisible: boolean;
  themeIcon: string;
  onToggleTheme: () => void;
  showDraftControls: boolean;
  canManageDraft: boolean;
  onStartDraft: () => void;
  onPauseDraft: () => void;
  onResumeDraft: () => void;
  audioController: ReturnType<typeof createDraftAudioController>;
  audioUnlocked: boolean;
  isMyTurn: boolean;
  userLabel: string;
  userAvatarKey: string | null;
  onParticipantHoverSeat: (seatNumber: number | null) => void;
}) {
  const isPre = props.draftStatus === "PENDING";
  const isPaused = props.draftStatus === "PAUSED";
  const isCompleted = props.draftStatus === "COMPLETED";

  const headerRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const leftWingRef = useRef<HTMLDivElement | null>(null);
  const rightWingRef = useRef<HTMLDivElement | null>(null);
  const leftMeasureRef = useRef<HTMLDivElement | null>(null);
  const rightMeasureRef = useRef<HTMLDivElement | null>(null);
  const participantStripRef = useRef<HTMLDivElement | null>(null);
  const participantStripMeasureRef = useRef<HTMLDivElement | null>(null);
  const buckleRef = useRef<HTMLDivElement | null>(null);
  const [compactHeader, setCompactHeader] = useState(false);
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);
  const [podiumCycleTick, setPodiumCycleTick] = useState(0);
  const nonCompactNeededWidthRef = useRef<number>(0);

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

  const podiumPositions = useMemo(
    () =>
      props.resultsPodium
        .map((p) => ({
          place: p.place,
          names: p.names.map((name) => name.trim()).filter((name) => name.length > 0)
        }))
        .filter((p) => p.names.length > 0)
        .sort((a, b) => a.place - b.place)
        .slice(0, 3),
    [props.resultsPodium]
  );
  const podiumSignature = useMemo(
    () => podiumPositions.map((p) => `${p.place}:${p.names.join("|")}`).join("||"),
    [podiumPositions]
  );
  const hasTiedPodiumPosition = useMemo(
    () => podiumPositions.some((p) => p.names.length > 1),
    [podiumPositions]
  );

  useEffect(() => {
    setPodiumCycleTick(0);
  }, [podiumSignature]);

  useEffect(() => {
    if (!props.isFinalResults || !hasTiedPodiumPosition) return;
    const interval = window.setInterval(() => {
      setPodiumCycleTick((prev) => prev + 1);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [hasTiedPodiumPosition, props.isFinalResults]);

  const { centerText, centerTypeLabel, centerTextRolling, centerTextKey } = (() => {
    if (props.isFinalResults) {
      const firstPlace = podiumPositions.find((p) => p.place === 1)?.names ?? [];
      if (firstPlace.length > 1) {
        return {
          centerText: firstPlace[podiumCycleTick % firstPlace.length] ?? firstPlace[0],
          centerTypeLabel: "Winner",
          centerTextRolling: true,
          centerTextKey: `winner-${podiumCycleTick % firstPlace.length}`
        };
      }
      if (firstPlace.length === 1) {
        return {
          centerText: firstPlace[0],
          centerTypeLabel: "Winner",
          centerTextRolling: false,
          centerTextKey: firstPlace[0]
        };
      }
      const raw = props.resultsWinnerLabel?.trim();
      if (!raw) {
        return {
          centerText: "Draft complete",
          centerTypeLabel: null,
          centerTextRolling: false,
          centerTextKey: "draft-complete"
        };
      }
      return {
        centerText: raw,
        centerTypeLabel: "Winner",
        centerTextRolling: false,
        centerTextKey: raw
      };
    }
    if (isPaused)
      return {
        centerText: "Paused",
        centerTypeLabel: null,
        centerTextRolling: false,
        centerTextKey: "paused"
      };
    if (isPre)
      return {
        centerText: "Not started",
        centerTypeLabel: null,
        centerTextRolling: false,
        centerTextKey: "not-started"
      };
    if (isCompleted)
      return {
        centerText: "Draft complete",
        centerTypeLabel: null,
        centerTextRolling: false,
        centerTextKey: "draft-complete"
      };
    return {
      centerText: props.isTimerDraft ? props.clockText : activeLabel,
      centerTypeLabel: null,
      centerTextRolling: false,
      centerTextKey: props.isTimerDraft ? props.clockText : activeLabel
    };
  })();
  const countdownActive = Boolean(
    props.isTimerDraft &&
    props.draftStatus === "IN_PROGRESS" &&
    !props.isFinalResults &&
    isCountdownActive(props.timerRemainingMs) &&
    // Only the active drafter gets urgency feedback (audio + flashing).
    props.isMyTurn
  );

  const [countdownPhase, setCountdownPhase] = useState<"gold" | "red" | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const canBeepRef = useRef(false);
  const audioControllerRef = useRef(props.audioController);

  useEffect(() => {
    audioControllerRef.current = props.audioController;
  }, [props.audioController]);

  useEffect(() => {
    canBeepRef.current = Boolean(props.audioUnlocked && props.isMyTurn);
  }, [props.audioUnlocked, props.isMyTurn]);

  useEffect(() => {
    if (!countdownActive) {
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setCountdownPhase(null);
      return;
    }

    // Start immediately when countdown begins.
    const tick = () => {
      setCountdownPhase((prev) => (prev === "red" ? "gold" : "red"));
      if (canBeepRef.current) playCountdownBeep(audioControllerRef.current);
    };

    tick();
    countdownIntervalRef.current = window.setInterval(tick, COUNTDOWN_BEEP_INTERVAL_MS);

    return () => {
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [countdownActive]);

  const buckleMaxPx = useMemo(() => {
    // Defensive default: ~25% of viewport, clamped.
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    return Math.min(
      DRAFT_BUCKLE_MAX_PX,
      Math.max(DRAFT_BUCKLE_MIN_PX, Math.floor(vw * DRAFT_BUCKLE_VW_FRACTION))
    );
  }, []);
  const showPodiumBuckles = props.isFinalResults && podiumPositions.length > 0;
  const podiumBuckleWidthPx = Math.max(140, Math.floor(buckleMaxPx * 0.82));
  const podiumOverlapPx = 32;
  const podiumSideShiftPx = Math.max(0, podiumBuckleWidthPx - podiumOverlapPx);
  const podiumRenderOrder =
    podiumPositions.length >= 3 ? [3, 1, 2] : podiumPositions.length === 2 ? [1, 2] : [1];
  const podiumByPlace = new Map(podiumPositions.map((p) => [p.place, p]));

  useEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl) return;

    const compute = () => {
      const headerRect = headerEl.getBoundingClientRect();
      const l = leftMeasureRef.current?.getBoundingClientRect();
      const r = rightMeasureRef.current?.getBoundingClientRect();
      const b = buckleRef.current?.getBoundingClientRect();
      if (!l || !r || !b) return;

      // Use a width-based model instead of bounding-box overlap. The buckle is centered,
      // so each "wing" must fit inside its half of the header.
      const headerPad = DRAFT_HEADER_SIDE_PADDING_PX * 2;
      const available = Math.max(0, headerRect.width - headerPad);
      const half = available / 2;
      const buckleHalf = b.width / 2;
      const leftW = l.width;
      const rightW = r.width;

      setCompactHeader((prev) => {
        const enterPad = DRAFT_HEADER_HYSTERESIS_ENTER_PX;
        const exitPad = DRAFT_HEADER_HYSTERESIS_EXIT_PX; // hysteresis to prevent flip-flop near the threshold
        const limit = half - buckleHalf - (prev ? exitPad : enterPad);
        const needsCompact = leftW > limit || rightW > limit;
        if (!prev) {
          nonCompactNeededWidthRef.current = Math.ceil(
            leftW + rightW + b.width + DRAFT_HEADER_NONCOMPACT_EXTRA_PX
          );
          return needsCompact;
        }
        // When compact, require more headroom before switching back.
        const hasRoom = !needsCompact;
        return hasRoom ? false : true;
      });
    };

    compute();
    const ro = new ResizeObserver(() => requestAnimationFrame(compute));
    ro.observe(headerEl);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Recompute when content changes even if the header size doesn't (e.g. split-screen).
    requestAnimationFrame(() => {
      const headerEl = headerRef.current;
      if (!headerEl) return;
      const headerRect = headerEl.getBoundingClientRect();
      const l = leftMeasureRef.current?.getBoundingClientRect();
      const r = rightMeasureRef.current?.getBoundingClientRect();
      const b = buckleRef.current?.getBoundingClientRect();
      if (!l || !r || !b) return;
      setCompactHeader((prev) => {
        const headerPad = DRAFT_HEADER_SIDE_PADDING_PX * 2;
        const available = Math.max(0, headerRect.width - headerPad);
        const half = available / 2;
        const buckleHalf = b.width / 2;
        const enterPad = DRAFT_HEADER_HYSTERESIS_ENTER_PX;
        const exitPad = DRAFT_HEADER_HYSTERESIS_EXIT_PX;
        const limit = half - buckleHalf - (prev ? exitPad : enterPad);
        const needsCompact = l.width > limit || r.width > limit;
        if (!prev) {
          nonCompactNeededWidthRef.current = Math.ceil(
            l.width + r.width + b.width + DRAFT_HEADER_NONCOMPACT_EXTRA_PX
          );
          return needsCompact;
        }
        return needsCompact ? true : false;
      });
    });
  }, [
    centerText,
    props.participants,
    props.userLabel,
    props.showDraftControls,
    props.showDraftedVisible,
    props.view,
    props.canToggleView
  ]);

  return (
    <Box className="dr-header">
      <Box className="drh-row" ref={headerRef}>
        <Box className="drh-left" ref={leftRef}>
          <Box className="drh-wing" ref={leftWingRef}>
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

        <Box className="drh-right" ref={rightRef}>
          <Box className="drh-wing drh-wingRight" ref={rightWingRef}>
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
              themeIcon={props.themeIcon}
              onToggleTheme={props.onToggleTheme}
              onStartDraft={props.onStartDraft}
              onPauseDraft={props.onPauseDraft}
              onResumeDraft={props.onResumeDraft}
              userLabel={props.userLabel}
              userAvatarKey={props.userAvatarKey}
            />
          </Box>
        </Box>

        <Box ref={buckleRef}>
          {showPodiumBuckles ? (
            <>
              {podiumRenderOrder.map((place) => {
                const podium = podiumByPlace.get(place as 1 | 2 | 3);
                if (!podium) return null;
                const names = podium.names;
                const currentName =
                  names.length > 1 ? names[podiumCycleTick % names.length] ?? names[0] : names[0];
                const isSide = place !== 1;
                return (
                  <CenterBuckle
                    key={`podium-${place}`}
                    roundNumber={null}
                    pickNumber={null}
                    centerText={currentName}
                    centerTypeLabel={place === 1 ? "Winner" : null}
                    centerTextRolling={names.length > 1}
                    centerTextKey={`podium-${place}-${podiumCycleTick % names.length}`}
                    shiftPx={place === 2 ? podiumSideShiftPx : place === 3 ? -podiumSideShiftPx : 0}
                    zIndex={place === 1 ? 7 : place === 2 ? 5 : 4}
                    className={[
                      "is-podium",
                      "is-fixed",
                      place === 2 ? "is-silver" : "",
                      place === 3 ? "is-bronze" : "",
                      isSide ? "is-podium-side" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    measureText={null}
                    isTimerDraft={false}
                    maxHandleLengthPx={podiumBuckleWidthPx}
                  />
                );
              })}
            </>
          ) : (
            <CenterBuckle
              roundNumber={isCompleted ? null : props.roundNumber}
              pickNumber={isCompleted ? null : props.pickNumber}
              centerText={centerText}
              centerTypeLabel={centerTypeLabel}
              centerTextRolling={centerTextRolling}
              centerTextKey={centerTextKey}
              className={[
                isPre ? "is-pre" : "",
                countdownActive ? "is-countdown" : "",
                countdownActive
                  ? countdownPhase === "red"
                    ? "pulse-red"
                    : "pulse-gold"
                  : ""
              ]
                .filter(Boolean)
                .join(" ")}
              measureText={
                props.isTimerDraft
                  ? null
                  : props.participants.reduce(
                      (longest, p) => (p.label.length > longest.length ? p.label : longest),
                      ""
                    )
              }
              isTimerDraft={props.isTimerDraft}
              maxHandleLengthPx={buckleMaxPx}
            />
          )}
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
          themeIcon={props.themeIcon}
          userLabel={props.userLabel}
          userAvatarKey={props.userAvatarKey}
        />
      </Box>
    </Box>
  );
}
