import type { DraftRoomOrchestration } from "../../orchestration/draft";
import { Box, Text, useMantineColorScheme } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { SiteFooterFineprintOnly } from "../../layout/SiteFooter";
import { useAuthContext } from "../../auth/context";
import { RuntimeBannerStack } from "../../notifications";
import { notifications } from "@mantine/notifications";
import {
  closeDraftAudio,
  createDraftAudioController,
  playTurnStartChime,
  unlockDraftAudio
} from "../../lib/draftAudio";
import { DraftBoardHeader } from "../../ui/draft/DraftBoardHeader";
import { DraftRoomScaffold } from "../../ui/draft/DraftRoomScaffold";
import { RosterBoardScaffold } from "../../ui/draft/RosterBoardScaffold";
import { MobileDraftRoom } from "../../ui/draft/mobile/MobileDraftRoom";

export function DraftRoomScreen(props: { o: DraftRoomOrchestration }) {
  const { user } = useAuthContext();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const isMobile = useMediaQuery("(max-width: 500px)");
  const isPreview = props.o.myRoster.pickDisabledReason === "Preview mode";
  const draftStatus = props.o.header.status ?? null;
  const isPre = draftStatus === "PENDING";
  const isPaused = draftStatus === "PAUSED";
  const isCompleted = draftStatus === "COMPLETED";
  const isFinalResults = props.o.header.isFinalResults;

  // "My turn" is based on the active seat, not whether a nomination is selected.
  // `myRoster.canPick` is stricter and includes selection + gating logic.
  const isMyTurn = isPreview
    ? true
    : Boolean(
        props.o.myRoster.seatNumber !== null &&
        props.o.header.participants.some(
          (p) => p.active && p.seatNumber === props.o.myRoster.seatNumber
        )
      );
  const isMyTurnStyling = isPreview ? true : Boolean(isMyTurn && !isPaused && !isPre);
  const previewUser = isPreview
    ? { label: "Alice", avatarKey: "gorilla" }
    : { label: user?.username ?? user?.sub ?? "—", avatarKey: user?.avatar_key ?? null };

  // Audio must be unlocked by a user gesture (browser autoplay policy).
  // Note: some browsers (notably iOS Safari) are pickier if the AudioContext is
  // constructed before a gesture. So we create it lazily on the first gesture.
  const audioControllerRef = useRef<ReturnType<typeof createDraftAudioController>>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    let didUnlock = false;
    const unlock = async () => {
      if (didUnlock) return;
      didUnlock = true;
      if (!audioControllerRef.current) {
        audioControllerRef.current = createDraftAudioController();
      }
      await unlockDraftAudio(audioControllerRef.current);
      setAudioUnlocked(Boolean(audioControllerRef.current));
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("mousedown", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
    };

    document.addEventListener("pointerdown", unlock, { passive: true });
    // iOS Safari can run without Pointer Events; listen for touchstart/mousedown too.
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("mousedown", unlock);
    document.addEventListener("keydown", unlock);

    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("mousedown", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
      closeDraftAudio(audioControllerRef.current);
    };
  }, []);

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
  }, [audioUnlocked, draftStatus, isMyTurn, isPreview]);

  const confirmTimerRef = useRef<number | null>(null);
  const confirmNominationRef = useRef<number | null>(null);
  const confirmToastIdRef = useRef<string | null>(null);

  const clearConfirmTimer = () => {
    if (confirmTimerRef.current) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  };

  const cancelDraftConfirmToast = () => {
    const id = confirmToastIdRef.current;
    if (id) notifications.hide(id);
    confirmToastIdRef.current = null;
    confirmNominationRef.current = null;
    clearConfirmTimer();
  };

  const scheduleDraftConfirmToast = (args: { nominationId: number; label: string }) => {
    cancelDraftConfirmToast();
    clearConfirmTimer();
    confirmNominationRef.current = args.nominationId;

    confirmTimerRef.current = window.setTimeout(() => {
      const nominationId = confirmNominationRef.current;
      if (!nominationId) return;

      const toastId = `draft.confirm.${nominationId}.${Date.now()}`;
      confirmToastIdRef.current = toastId;
      notifications.show({
        id: toastId,
        autoClose: false,
        withCloseButton: true,
        onClose: () => {
          confirmToastIdRef.current = null;
          confirmNominationRef.current = null;
          props.o.myRoster.clearSelection();
        },
        message: (
          <Box
            data-fo-draft-confirm-toast="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              cancelDraftConfirmToast();
              props.o.myRoster.submitPickNomination(nominationId);
            }}
            style={{ cursor: "pointer" }}
          >
            <Text fw={700}>Confirm draft pick</Text>
            <Text c="dimmed" size="sm">
              Draft “{args.label}”
            </Text>
          </Box>
        )
      });
    }, 220);
  };

  // Draft actions are available during live drafts when it's "my turn".
  // Note: `myRoster.canPick` is selection-dependent; we want click-to-confirm
  // to work *before* a nomination is selected.
  const canDraftAction = Boolean(
    !isPaused &&
    !isPre &&
    !isCompleted &&
    (isPreview || (props.o.header.status === "IN_PROGRESS" && isMyTurn))
  );

  const draftedNominationIds = useMemo(() => {
    const set = new Set<number>();
    for (const r of props.o.ledger.rows) {
      if (typeof r.nominationId === "number") set.add(r.nominationId);
    }
    return set;
  }, [props.o.ledger.rows]);

  // Phase 0: blank composition scaffold only.
  // Header/body/footer are separated by minimal rules.
  // The body is divided into "units" (frame width / divisor), with rails consuming
  // 1.25 units open / 0.25 units collapsed. The divisor is snapped to keep units
  // within a readable pixel range.
  const categories = props.o.pool.categories.map((c) => ({
    id: String(c.id),
    title: c.title,
    icon: c.icon,
    iconVariant: c.iconVariant ?? "default",
    unitKind: c.unitKind ?? "",
    weight: c.weight ?? null,
    nominees: c.nominations.map((n) => ({
      id: String(n.id),
      label: n.label,
      muted: n.muted,
      winner: n.winner,
      posterUrl: n.posterUrl ?? null,
      filmTitle: n.filmTitle ?? null,
      filmYear: n.filmYear ?? null,
      contributors: n.contributors ?? [],
      songTitle: n.songTitle ?? null,
      performerName: n.performerName ?? null,
      performerCharacter: n.performerCharacter ?? null,
      performerProfileUrl: n.performerProfileUrl ?? null,
      performerProfilePath: n.performerProfilePath ?? null
    }))
  }));

  const nomineeById = useMemo(() => {
    const m = new Map<
      number,
      {
        unitKind: string;
        categoryName: string;
        filmTitle: string | null;
        filmYear: number | null;
        filmPosterUrl: string | null;
        contributors: string[];
        performerName: string | null;
        performerCharacter: string | null;
        performerProfileUrl: string | null;
        performerProfilePath: string | null;
        songTitle: string | null;
        categoryIcon: string;
        categoryIconVariant: "default" | "inverted";
      }
    >();

    for (const c of categories) {
      for (const n of c.nominees) {
        const id = Number(n.id);
        if (!Number.isFinite(id)) continue;
        m.set(id, {
          unitKind: c.unitKind,
          categoryName: c.title,
          filmTitle: n.filmTitle,
          filmYear: n.filmYear,
          filmPosterUrl: n.posterUrl,
          contributors: n.contributors,
          performerName: n.performerName,
          performerCharacter: n.performerCharacter,
          performerProfileUrl: n.performerProfileUrl,
          performerProfilePath: n.performerProfilePath,
          songTitle: n.songTitle,
          categoryIcon: c.icon,
          categoryIconVariant: c.iconVariant
        });
      }
    }
    return m;
  }, [categories]);

  const avatarKeyBySeat = useMemo(() => {
    const m = new Map<number, string | null>();
    for (const p of props.o.header.participants) m.set(p.seatNumber, p.avatarKey ?? null);
    return m;
  }, [props.o.header.participants]);

  useEffect(() => {
    // Cleanup any pending confirm UI if the user loses the ability to draft.
    if (!canDraftAction) {
      clearConfirmTimer();
      confirmNominationRef.current = null;
      cancelDraftConfirmToast();
    }
    return () => {
      cancelDraftConfirmToast();
      clearConfirmTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDraftAction]);

  useEffect(() => {
    // Clicking anywhere outside the toast cancels the pending draft confirmation.
    const onPointerDown = () => {
      if (!confirmToastIdRef.current) return;
      cancelDraftConfirmToast();
      props.o.myRoster.clearSelection();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        participants={props.o.header.participants}
        direction={props.o.header.direction}
        roundNumber={props.o.header.roundNumber}
        pickNumber={props.o.header.pickNumber}
        isTimerDraft={props.o.header.hasTimer}
        timerRemainingMs={props.o.header.timerRemainingMs}
        clockText={props.o.header.clockText}
        draftStatus={draftStatus}
        isFinalResults={isFinalResults}
        resultsWinnerLabel={props.o.header.resultsWinnerLabel}
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
            canDraftAction={canDraftAction}
            onNomineeClick={(id, label) => {
              if (!canDraftAction) return;
              props.o.pool.onSelectNomination(id);
              scheduleDraftConfirmToast({ nominationId: id, label });
            }}
            onNomineeDoubleClick={(id) => {
              if (!canDraftAction) return;
              clearConfirmTimer();
              cancelDraftConfirmToast();
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
