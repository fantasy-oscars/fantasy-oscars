import type { DraftRoomOrchestration } from "@/orchestration/draft";
import { Box, useMantineColorScheme } from "@ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@ui/hooks";
import { SiteFooterFineprintOnly } from "@/app/layouts/SiteFooter";
import { useAuthContext } from "@/auth/context";
import { RuntimeBannerStack } from "@/notifications";
import { playTurnStartChime } from "@/lib/draftAudio";
import { DraftBoardHeader } from "./DraftBoardHeader";
import { DraftRoomScaffold } from "./DraftRoomScaffold";
import { RosterBoardScaffold } from "./RosterBoardScaffold";
import { MobileDraftRoom } from "./mobile/MobileDraftRoom";
import { useDraftAudioUnlock } from "./useDraftAudioUnlock";
import { FO_BP_MOBILE_MAX_PX } from "@/tokens/breakpoints";
import { PageError, PageLoader } from "@/shared/page-state";
import {
  buildDraftedNominationIds,
  buildNomineeMetaById,
  mapDraftScreenCategories
} from "./draftRoomScreenModel";
import { pickDeterministicAvatarKey } from "@/decisions/avatars";
import { formatSignedInt } from "@/decisions/draftRoomLayout";

export function DraftRoomScreen(props: { o: DraftRoomOrchestration }) {
  const { user } = useAuthContext();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const isMobile = useMediaQuery(`(max-width: ${FO_BP_MOBILE_MAX_PX}px)`);
  const isPreview = props.o.myRoster.pickDisabledReason === "Preview mode";
  const draftStatus = props.o.header.status ?? null;
  const isPre = draftStatus === "PENDING";
  const isPaused = draftStatus === "PAUSED";
  const isCompleted = draftStatus === "COMPLETED";
  const isFinalResults = props.o.header.isFinalResults;
  const [hoveredSeatNumber, setHoveredSeatNumber] = useState<number | null>(null);

  const participants = useMemo(
    () =>
      props.o.header.participants.map((p) => ({
        ...p,
        // UI tokens require an avatar key; fall back deterministically from the label.
        avatarKey: p.avatarKey ?? pickDeterministicAvatarKey(p.label)
      })),
    [props.o.header.participants]
  );

  const avatarKeyBySeat = useMemo(() => {
    const m = new Map<number, string | null>();
    for (const p of participants) m.set(p.seatNumber, p.avatarKey);
    return m;
  }, [participants]);

  // "My turn" is based on the active seat, not whether a nomination is selected.
  // `myRoster.canPick` is stricter and includes selection + gating logic.
  const isMyTurn = isPreview
    ? true
    : Boolean(
        props.o.myRoster.seatNumber !== null &&
        participants.some((p) => p.active && p.seatNumber === props.o.myRoster.seatNumber)
      );
  const isMyTurnStyling = isPreview ? true : Boolean(isMyTurn && !isPaused && !isPre);
  const previewUser = isPreview
    ? { label: "Alice", avatarKey: "gorilla" }
    : { label: user?.username ?? user?.sub ?? "—", avatarKey: user?.avatar_key ?? null };

  const { audioControllerRef, audioUnlocked } = useDraftAudioUnlock();

  // Turn-start chime: invoke on "turn ownership" transitions (active seat flips to me),
  // not on click/draft actions. This naturally suppresses snake double-picks because
  // `isMyTurn` stays true across the back-to-back pick.
  const prevIsMyTurnRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (isPreview) return;
    if (draftStatus !== "IN_PROGRESS") {
      prevIsMyTurnRef.current = isMyTurn;
      return;
    }
    const prev = prevIsMyTurnRef.current;
    if (audioUnlocked && prev !== null && !prev && isMyTurn) {
      playTurnStartChime(audioControllerRef.current);
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [audioControllerRef, audioUnlocked, draftStatus, isMyTurn, isPreview]);

  // Draft actions are available during live drafts when it's "my turn".
  // Note: `myRoster.canPick` is selection-dependent; we want click-to-confirm
  // to work *before* a nomination is selected.
  const canDraftAction = Boolean(
    !isPaused &&
    !isPre &&
    !isCompleted &&
    (isPreview || (props.o.header.status === "IN_PROGRESS" && isMyTurn))
  );

  useEffect(() => {
    if (!canDraftAction) props.o.myRoster.clearSelection();
  }, [canDraftAction, props.o.myRoster]);
  const draftedNominationIds = useMemo(
    () => buildDraftedNominationIds(props.o.ledger.rows),
    [props.o.ledger.rows]
  );
  const draftedMetaByNominationId = useMemo(() => {
    const m = new Map<
      number,
      {
        draftedByLabel: string;
        draftedByAvatarKey: string | null;
        draftedRoundPick: string;
      }
    >();
    for (const row of props.o.ledger.rows) {
      if (row.nominationId == null) continue;
      const participant =
        row.seatNumber != null
          ? participants.find((p) => p.seatNumber === row.seatNumber)
          : null;
      m.set(row.nominationId, {
        draftedByLabel: row.seatLabel || participant?.label || "Unknown drafter",
        draftedByAvatarKey: participant?.avatarKey ?? null,
        draftedRoundPick: row.roundPick
      });
    }
    return m;
  }, [participants, props.o.ledger.rows]);
  const draftedSeatByNominationId = useMemo(() => {
    const m = new Map<number, number>();
    for (const row of props.o.ledger.rows) {
      if (row.nominationId == null || row.seatNumber == null) continue;
      m.set(row.nominationId, row.seatNumber);
    }
    return m;
  }, [props.o.ledger.rows]);
  const hoveredNominationIds = useMemo(() => {
    if (hoveredSeatNumber == null) return new Set<number>();
    const set = new Set<number>();
    for (const [nominationId, seatNumber] of draftedSeatByNominationId) {
      if (seatNumber === hoveredSeatNumber) set.add(nominationId);
    }
    return set;
  }, [draftedSeatByNominationId, hoveredSeatNumber]);

  // Phase 0: blank composition scaffold only.
  // Header/body/footer are separated by minimal rules.
  // The body is divided into "units" (frame width / divisor), with rails consuming
  // 1.25 units open / 0.25 units collapsed. The divisor is snapped to keep units
  // within a readable pixel range.
  const categoriesRaw = useMemo(
    () => mapDraftScreenCategories(props.o.pool.categories),
    [props.o.pool.categories]
  );
  const categories = useMemo(
    () =>
      categoriesRaw.map((c) => ({
        ...c,
        weightText: typeof c.weight === "number" ? formatSignedInt(c.weight) : null,
        nominees: c.nominees.map((n) => {
          const draftedMeta = draftedMetaByNominationId.get(Number(n.id));
          return {
            ...n,
            draftedByLabel: draftedMeta?.draftedByLabel ?? null,
            draftedByAvatarKey: draftedMeta?.draftedByAvatarKey ?? null,
            draftedRoundPick: draftedMeta?.draftedRoundPick ?? null
          };
        })
      })),
    [categoriesRaw, draftedMetaByNominationId]
  );
  const nomineeById = useMemo(() => {
    const base = buildNomineeMetaById(categoriesRaw);
    const m = new Map(base);
    for (const [nominationId, draftedMeta] of draftedMetaByNominationId) {
      const nominee = m.get(nominationId);
      if (!nominee) continue;
      m.set(nominationId, {
        ...nominee,
        draftedByLabel: draftedMeta.draftedByLabel,
        draftedByAvatarKey: draftedMeta.draftedByAvatarKey,
        draftedRoundPick: draftedMeta.draftedRoundPick
      });
    }
    return m;
  }, [categoriesRaw, draftedMetaByNominationId]);

  if (props.o.state.loadingInitial) {
    return <PageLoader label="Loading draft board..." />;
  }

  if (!props.o.header.status && props.o.state.error) {
    return <PageError message={props.o.state.error} />;
  }

  if (isMobile) {
    return (
      <MobileDraftRoom
        o={props.o}
        isPreview={isPreview}
        isPre={isPre}
        isPaused={isPaused}
        isCompleted={isCompleted}
        isFinalResults={isFinalResults}
        isMyTurnStyling={isMyTurnStyling}
        isMyTurn={isMyTurn}
        previewUser={previewUser}
        categories={categories}
        nomineeById={nomineeById}
        draftedNominationIds={draftedNominationIds}
        avatarKeyBySeat={avatarKeyBySeat}
        canDraftAction={canDraftAction}
        audioController={audioControllerRef.current}
        audioUnlocked={audioUnlocked}
        showDrafted={props.o.header.poolMode === "ALL_MUTED"}
        onToggleShowDrafted={(next) =>
          props.o.header.setPoolMode(next ? "ALL_MUTED" : "UNDRAFTED_ONLY")
        }
        showDraftedVisible={
          !isCompleted && (isPre ? true : props.o.header.view === "draft")
        }
        themeIcon={colorScheme === "dark" ? "\ue518" : "\ue51c"}
        onToggleTheme={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
      />
    );
  }

  return (
    <Box
      className="dr-frame"
      data-screen="draft-room"
      data-turn={isMyTurnStyling ? "mine" : "theirs"}
      data-results={isFinalResults ? "final" : "live"}
    >
      <DraftBoardHeader
        backHref={props.o.nav.backToSeasonHref}
        participants={participants}
        direction={props.o.header.direction}
        roundNumber={props.o.header.roundNumber}
        pickNumber={props.o.header.pickNumber}
        isTimerDraft={props.o.header.hasTimer}
        timerRemainingMs={props.o.header.timerRemainingMs}
        clockText={props.o.header.clockText}
        draftStatus={draftStatus}
        isFinalResults={isFinalResults}
        resultsWinnerLabel={props.o.header.resultsWinnerLabel}
        resultsPodium={props.o.header.resultsPodium}
        view={isPre ? "draft" : isCompleted ? "roster" : props.o.header.view}
        onViewChange={props.o.header.setView}
        canToggleView={props.o.header.canToggleView && !isPre && !isCompleted}
        showDrafted={props.o.header.poolMode === "ALL_MUTED"}
        onToggleShowDrafted={(next) =>
          props.o.header.setPoolMode(next ? "ALL_MUTED" : "UNDRAFTED_ONLY")
        }
        showDraftedVisible={
          !isCompleted && (isPre ? true : props.o.header.view === "draft")
        }
        themeIcon={colorScheme === "dark" ? "\ue518" : "\ue51c"}
        onToggleTheme={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
        showDraftControls={!isCompleted}
        canManageDraft={isPreview ? true : props.o.header.canManageDraft}
        onStartDraft={props.o.header.onStartDraft}
        onPauseDraft={props.o.header.onPauseDraft}
        onResumeDraft={props.o.header.onResumeDraft}
        audioController={audioControllerRef.current}
        audioUnlocked={audioUnlocked}
        isMyTurn={isMyTurn}
        userLabel={previewUser.label}
        userAvatarKey={previewUser.avatarKey}
        onParticipantHoverSeat={setHoveredSeatNumber}
      />
      <RuntimeBannerStack />
      <Box className="dr-body">
        {isCompleted || props.o.header.view === "roster" ? (
          <RosterBoardScaffold o={props.o} nomineeById={nomineeById} />
        ) : (
          <DraftRoomScaffold
            categories={categories}
            draftStatus={draftStatus}
            hideEmptyCategories={props.o.header.poolMode === "UNDRAFTED_ONLY"}
            ledgerRows={props.o.ledger.rows}
            myPicks={props.o.myRoster.picks}
            avatarKeyBySeat={avatarKeyBySeat}
            nomineeById={nomineeById}
            autodraft={props.o.autodraft}
            draftedNominationIds={draftedNominationIds}
            hoveredNominationIds={hoveredNominationIds}
            canDraftAction={canDraftAction}
            onNomineeClick={(id) => {
              if (!canDraftAction) return;
              if (draftedNominationIds.has(id)) return;
              if (props.o.myRoster.selected?.id === id) {
                props.o.myRoster.clearSelection();
                return;
              }
              props.o.pool.onSelectNomination(id);
            }}
            onNomineeDoubleClick={(id) => {
              if (!canDraftAction) return;
              props.o.myRoster.clearSelection();
              props.o.myRoster.submitPickNomination(id);
            }}
          />
        )}
      </Box>
      <Box className="dr-footer">
        <SiteFooterFineprintOnly />
      </Box>
    </Box>
  );
}
