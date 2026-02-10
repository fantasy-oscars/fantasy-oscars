import type { DraftRoomOrchestration } from "../../orchestration/draft";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineColorScheme
} from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { NomineeTooltipCard } from "../../components/draft/NomineeTooltipCard";
import { SiteFooterFineprintOnly } from "../../layout/SiteFooter";
import { useAuthContext } from "../../auth/context";
import { AnimalAvatarIcon } from "../../ui/animalAvatarIcon";
import { pickDeterministicAvatarKey } from "../../decisions/avatars";
import { RuntimeBannerStack } from "../../notifications";
import { notifications } from "@mantine/notifications";
import { DraftCategoryIcon } from "../../ui/draft/DraftCategoryIcon";
import {
  closeDraftAudio,
  createDraftAudioController,
  playTurnStartChime,
  unlockDraftAudio
} from "../../lib/draftAudio";
import {
  computeMasonry,
  estimateCategoryCardHeightPx,
} from "../../decisions/draftRoomLayout";
import { pickDraftDivisor } from "../../decisions/draftRoomUnits";
import {
  NOMINEE_CARD_TOOLTIP_STYLES,
  NOMINEE_TOOLTIP_EVENTS
} from "../../ui/draft/nomineeTooltip";
import { DraftBoardHeader } from "../../ui/draft/DraftBoardHeader";
import { CategoryCard } from "../../ui/draft/CategoryCard";
import { RosterBoardScaffold } from "../../ui/draft/RosterBoardScaffold";
import { MobileRail } from "../../ui/draft/mobile/MobileRail";
import { MobileDraftHeader } from "../../ui/draft/mobile/MobileDraftHeader";
import { MobileRosterBoard } from "../../ui/draft/mobile/MobileRosterBoard";

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

function MobileDraftRoom(props: {
  o: DraftRoomOrchestration;
  isPreview: boolean;
  isPre: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  isFinalResults: boolean;
  isMyTurnStyling: boolean;
  isMyTurn: boolean;
  previewUser: { label: string; avatarKey: string | null };
  audioController: ReturnType<typeof createDraftAudioController>;
  audioUnlocked: boolean;
  categories: Array<{
    id: string;
    title: string;
    icon: string;
    iconVariant: "default" | "inverted";
    unitKind: string;
    weight: number | null;
    nominees: Array<{
      id: string;
      label: string;
      muted: boolean;
      winner: boolean;
      posterUrl: string | null;
      filmTitle: string | null;
      filmYear: number | null;
      contributors: string[];
      songTitle: string | null;
      performerName: string | null;
      performerCharacter: string | null;
      performerProfileUrl: string | null;
      performerProfilePath: string | null;
    }>;
  }>;
  nomineeById: Map<
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
  >;
  draftedNominationIds: Set<number>;
  avatarKeyBySeat: Map<number, string | null>;
  canDraftAction: boolean;
  showDrafted: boolean;
  onToggleShowDrafted: (next: boolean) => void;
  showDraftedVisible: boolean;
  themeIcon: string;
  onToggleTheme: () => void;
}) {
  const { o } = props;
  const draftStatus = o.header.status ?? null;
  const isCompleted = props.isCompleted;

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeRail, setActiveRail] = useState<"ledger" | "roster" | "autodraft" | null>(
    null
  );

  const [mobileNominationId, setMobileNominationId] = useState<number | null>(null);

  const hideEmptyCategories = o.header.poolMode === "UNDRAFTED_ONLY";
  const categoriesForList = hideEmptyCategories
    ? props.categories.filter((c) => c.nominees.length > 0)
    : props.categories;

  const mobileNominee =
    mobileNominationId != null
      ? (props.nomineeById.get(mobileNominationId) ?? null)
      : null;

  const closeNomineeCard = () => {
    setMobileNominationId(null);
    o.myRoster.clearSelection();
  };

  const openNomineeCard = (id: number) => {
    o.pool.onSelectNomination(id);
    setMobileNominationId(id);
  };

  const canOpenLedger = !props.isPre && !isCompleted;
  const canOpenRosterRail = !props.isPre && !isCompleted;
  const canOpenAutodraft = !isCompleted;

  return (
    <Box
      className="dr-frame"
      data-screen="draft-room"
      data-turn={props.isMyTurnStyling ? "mine" : "theirs"}
      data-results={props.isFinalResults ? "final" : "live"}
      data-mobile="true"
    >
      <MobileDraftHeader
        open={menuOpen}
        onOpen={() => setMenuOpen(true)}
        onClose={() => setMenuOpen(false)}
        backHref="/seasons"
        participants={o.header.participants}
        direction={o.header.direction}
        roundNumber={o.header.roundNumber}
        pickNumber={o.header.pickNumber}
        isTimerDraft={o.header.hasTimer}
        timerRemainingMs={o.header.timerRemainingMs}
        clockText={o.header.clockText}
        draftStatus={draftStatus}
        isMyTurn={props.isMyTurn}
        audioController={props.audioController}
        audioUnlocked={props.audioUnlocked}
        showDraftControls={!isCompleted}
        canManageDraft={props.isPreview ? true : o.header.canManageDraft}
        onStartDraft={o.header.onStartDraft}
        onPauseDraft={o.header.onPauseDraft}
        onResumeDraft={o.header.onResumeDraft}
        isFinalResults={props.isFinalResults}
        resultsWinnerLabel={o.header.resultsWinnerLabel}
        view={props.isPre ? "draft" : isCompleted ? "roster" : o.header.view}
        onViewChange={(v) => o.header.setView(v)}
        canToggleView={o.header.canToggleView && !props.isPre && !isCompleted}
        showDrafted={props.showDrafted}
        onToggleShowDrafted={props.onToggleShowDrafted}
        showDraftedVisible={props.showDraftedVisible}
        themeIcon={props.themeIcon}
        onToggleTheme={props.onToggleTheme}
        userLabel={props.previewUser.label}
        userAvatarKey={props.previewUser.avatarKey}
      />

      <RuntimeBannerStack />

      <Box className="dr-body">
        <Box className="dr-mobileScroll">
          {isCompleted || o.header.view === "roster" ? (
            <MobileRosterBoard o={o} nomineeById={props.nomineeById} />
          ) : activeRail ? (
            <MobileRail
              rail={activeRail}
              o={o}
              avatarKeyBySeat={props.avatarKeyBySeat}
              nomineeById={props.nomineeById}
              draftedNominationIds={props.draftedNominationIds}
            />
          ) : (
            <Stack gap="sm" className="dr-mobileCategories">
              {categoriesForList.map((c) => (
                <CategoryCard
                  key={c.id}
                  categoryId={c.id}
                  title={c.title}
                  icon={c.icon}
                  iconVariant={c.iconVariant}
                  unitKind={c.unitKind}
                  tooltipsEnabled={false}
                  weight={c.weight}
                  nominees={c.nominees}
                  isKeyboardMode={false}
                  setKeyboardMode={() => {}}
                  canDraftAction={props.canDraftAction}
                  onNomineeClick={(id) => openNomineeCard(id)}
                  onNomineeDoubleClick={() => {}}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      {!isCompleted && o.header.view !== "roster" ? (
        <Box className="dr-mobileBottomBar" role="navigation" aria-label="Draft rails">
          <Group justify="space-between" gap={0} wrap="nowrap">
            <UnstyledButton
              type="button"
              className={[
                "dr-mobileRailBtn",
                activeRail === "ledger" ? "is-active" : "",
                canOpenLedger ? "" : "is-disabled"
              ].join(" ")}
              aria-label="Draft history"
              onClick={() => {
                if (!canOpenLedger) return;
                setActiveRail((r) => (r === "ledger" ? null : "ledger"));
              }}
            >
              <Text component="span" className="mi-icon" aria-hidden="true">
                history
              </Text>
            </UnstyledButton>
            <UnstyledButton
              type="button"
              className={[
                "dr-mobileRailBtn",
                activeRail === "roster" ? "is-active" : "",
                canOpenRosterRail ? "" : "is-disabled"
              ].join(" ")}
              aria-label="My roster"
              onClick={() => {
                if (!canOpenRosterRail) return;
                setActiveRail((r) => (r === "roster" ? null : "roster"));
              }}
            >
              <Text component="span" className="mi-icon" aria-hidden="true">
                patient_list
              </Text>
            </UnstyledButton>
            <UnstyledButton
              type="button"
              className={[
                "dr-mobileRailBtn",
                activeRail === "autodraft" ? "is-active" : "",
                canOpenAutodraft ? "" : "is-disabled"
              ].join(" ")}
              aria-label="Auto-draft"
              onClick={() => {
                if (!canOpenAutodraft) return;
                setActiveRail((r) => (r === "autodraft" ? null : "autodraft"));
              }}
            >
              <Text component="span" className="mi-icon" aria-hidden="true">
                smart_toy
              </Text>
            </UnstyledButton>
          </Group>
        </Box>
      ) : null}

      <Box className="dr-footer">
        <SiteFooterFineprintOnly />
      </Box>

      <Modal
        opened={mobileNominationId != null}
        onClose={closeNomineeCard}
        centered
        withCloseButton={false}
        overlayProps={{ opacity: 0.3, blur: 2 }}
      >
        <Box style={{ position: "relative" }}>
          <ActionIcon
            variant="subtle"
            onClick={closeNomineeCard}
            aria-label="Close"
            style={{ position: "absolute", right: 4, top: 4, zIndex: 2 }}
          >
            <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
              close
            </Text>
          </ActionIcon>

          {mobileNominee ? (
            <NomineeTooltipCard
              unitKind={mobileNominee.unitKind}
              categoryName={mobileNominee.categoryName}
              filmTitle={mobileNominee.filmTitle}
              filmYear={mobileNominee.filmYear}
              filmPosterUrl={mobileNominee.filmPosterUrl}
              contributors={mobileNominee.contributors}
              performerName={mobileNominee.performerName}
              performerCharacter={mobileNominee.performerCharacter}
              performerProfileUrl={mobileNominee.performerProfileUrl}
              performerProfilePath={mobileNominee.performerProfilePath}
              songTitle={mobileNominee.songTitle}
              action={
                props.canDraftAction ? (
                  <Button
                    fullWidth
                    onClick={() => {
                      const id = mobileNominationId;
                      if (id == null) return;
                      closeNomineeCard();
                      o.myRoster.submitPickNomination(id);
                    }}
                  >
                    Draft
                  </Button>
                ) : null
              }
            />
          ) : (
            <Text className="baseline-textBody">—</Text>
          )}
        </Box>
      </Modal>
    </Box>
  );
}

function DraftRoomScaffold(props: {
  categories: Array<{
    id: string;
    title: string;
    icon: string;
    iconVariant: "default" | "inverted";
    unitKind: string;
    weight: number | null;
    nominees: Array<{
      id: string;
      label: string;
      muted: boolean;
      winner: boolean;
      posterUrl: string | null;
      filmTitle: string | null;
      filmYear: number | null;
      contributors: string[];
      songTitle: string | null;
      performerName: string | null;
      performerCharacter: string | null;
      performerProfileUrl: string | null;
      performerProfilePath: string | null;
    }>;
  }>;
  draftStatus: string | null;
  hideEmptyCategories: boolean;
  ledgerRows: DraftRoomOrchestration["ledger"]["rows"];
  myPicks: DraftRoomOrchestration["myRoster"]["picks"];
  avatarKeyBySeat: Map<number, string | null>;
  nomineeById: Map<
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
  >;
  autodraft: DraftRoomOrchestration["autodraft"];
  draftedNominationIds: Set<number>;
  canDraftAction: boolean;
  onNomineeClick: (nominationId: number, label: string) => void;
  onNomineeDoubleClick: (nominationId: number) => void;
}) {
  const isPre = props.draftStatus === "PENDING";
  const isLiveOrPaused =
    props.draftStatus === "IN_PROGRESS" || props.draftStatus === "PAUSED";

  // A11y: tab order defaults to category headers; entering a category makes its pills tabbable.
  const [keyboardCategoryId, setKeyboardCategoryId] = useState<string | null>(null);

  const [viewportWidthPx, setViewportWidthPx] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 0
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf: number | null = null;
    const onResize = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        setViewportWidthPx(window.innerWidth);
        raf = null;
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const unitDivisor = useMemo(() => pickDraftDivisor(viewportWidthPx), [viewportWidthPx]);

  const [ledgerOpen, setLedgerOpen] = useState(!isPre);
  const [myRosterOpen, setMyRosterOpen] = useState(!isPre);
  const [autoDraftOpen, setAutoDraftOpen] = useState(true);

  // Stopgap: narrow desktop keeps board visible but prevents "all rails open" squeeze.
  // (Mobile uses a separate layout path.)
  const compactRails = viewportWidthPx > 0 && viewportWidthPx < 665;

  const openRailExclusive = (rail: "ledger" | "roster" | "auto") => {
    if (!compactRails) return;
    setLedgerOpen(rail === "ledger");
    setMyRosterOpen(rail === "roster");
    setAutoDraftOpen(rail === "auto");
  };

  useEffect(() => {
    if (isPre) {
      setLedgerOpen(false);
      setMyRosterOpen(false);
      setAutoDraftOpen(true);
      return;
    }
    if (isLiveOrPaused) {
      // Leave user toggles as-is once the draft is live/paused.
      return;
    }
  }, [isLiveOrPaused, isPre]);

  useEffect(() => {
    if (!compactRails) return;
    // Enforce mutual exclusivity if we enter compact mode with multiple rails open.
    const openCount =
      (ledgerOpen ? 1 : 0) + (myRosterOpen ? 1 : 0) + (autoDraftOpen ? 1 : 0);
    if (openCount <= 1) return;
    // Prefer the most recently-relevant rail: auto-draft pre-draft, otherwise roster.
    if (isPre) openRailExclusive("auto");
    else openRailExclusive(myRosterOpen ? "roster" : ledgerOpen ? "ledger" : "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactRails]);

  const expandedCount =
    (ledgerOpen ? 1 : 0) + (myRosterOpen ? 1 : 0) + (autoDraftOpen ? 1 : 0);
  const midColsMax = Math.max(1, Math.round(unitDivisor - 0.75)); // 0.75 = 3 collapsed rails
  const midCols = Math.max(1, midColsMax - expandedCount);

  const categoriesForBoxes = props.hideEmptyCategories
    ? props.categories.filter((c) => c.nominees.length > 0)
    : props.categories;

  const boxes = categoriesForBoxes.map((c) => ({
    id: c.id,
    title: c.title,
    icon: c.icon,
    iconVariant: c.iconVariant,
    unitKind: c.unitKind,
    weight: c.weight,
    nominees: c.nominees,
    // Use a deterministic estimate for masonry placement; the actual card height
    // is content-driven and hugs the pills.
    estimatePx: estimateCategoryCardHeightPx(c.nominees.length)
  }));
  const masonry = computeMasonry(midCols, boxes);

  return (
    <Box
      className="dr-layout"
      style={{
        ["--d" as never]: unitDivisor,
        ["--rail-ledger" as never]: ledgerOpen ? 1.25 : 0.25,
        ["--rail-roster" as never]: myRosterOpen ? 1.25 : 0.25,
        ["--rail-auto" as never]: autoDraftOpen ? 1.25 : 0.25,
        ["--mid-cols" as never]: midCols
      }}
    >
      <Box
        className={[
          "dr-rail",
          "dr-rail-ledger",
          ledgerOpen ? "is-open" : "is-collapsed"
        ].join(" ")}
      >
        {ledgerOpen ? (
          <Box className="dr-railPane">
            <Box className="dr-railPaneHeader">
              <Box className="dr-railPaneTitleRow">
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  history
                </Text>
                <Text className="dr-railPaneTitle">Draft History</Text>
              </Box>
              <UnstyledButton
                type="button"
                className="dr-railClose"
                aria-label="Collapse draft history"
                onClick={() => setLedgerOpen(false)}
              >
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  chevron_left
                </Text>
              </UnstyledButton>
            </Box>
            <Box
              className="dr-railPaneBody"
              role="region"
              aria-label="Draft history"
              tabIndex={0}
            >
              <Box className="dr-railList">
                {props.ledgerRows.map((r) => {
                  const nominee = r.nominationId
                    ? (props.nomineeById.get(r.nominationId) ?? null)
                    : null;
                  const avatarKey =
                    r.seatNumber !== null
                      ? (props.avatarKeyBySeat.get(r.seatNumber) ??
                        pickDeterministicAvatarKey(r.seatLabel))
                      : null;
                  const pill = (
                    <Box
                      className={[
                        "dr-pill",
                        "dr-pill-static",
                        r.label === "—" ? "is-muted" : "",
                        r.winner ? "is-winner" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      tabIndex={nominee ? 0 : undefined}
                      role={nominee ? "group" : undefined}
                      aria-label={
                        nominee ? `${nominee.categoryName}: ${r.label}` : undefined
                      }
                    >
                      {nominee ? (
                        <DraftCategoryIcon
                          icon={nominee.categoryIcon}
                          variant={nominee.categoryIconVariant}
                          className="dr-pill-icon"
                        />
                      ) : r.icon ? (
                        <DraftCategoryIcon
                          icon={r.icon}
                          variant="default"
                          className="dr-pill-icon"
                        />
                      ) : null}
                      <Text component="span" className="dr-pill-text" lineClamp={1}>
                        {r.label}
                      </Text>
                    </Box>
                  );

                  return (
                    <Box
                      key={r.pickNumber}
                      className="dr-railRow dr-ledgerRow"
                      data-active={r.active ? "true" : "false"}
                    >
                      <Text className="dr-railMeta">{r.roundPick}</Text>
                      <Box className="dr-railAvatar">
                        <AnimalAvatarIcon avatarKey={avatarKey} size={22} />
                      </Box>
                      {nominee ? (
                        <Tooltip
                          events={NOMINEE_TOOLTIP_EVENTS}
                          withArrow={false}
                          position="bottom-start"
                          multiline
                          offset={10}
                          styles={NOMINEE_CARD_TOOLTIP_STYLES}
                          label={
                            <NomineeTooltipCard
                              unitKind={nominee.unitKind}
                              categoryName={nominee.categoryName}
                              filmTitle={nominee.filmTitle}
                              filmYear={nominee.filmYear}
                              filmPosterUrl={nominee.filmPosterUrl}
                              contributors={nominee.contributors}
                              performerName={nominee.performerName}
                              performerCharacter={nominee.performerCharacter}
                              performerProfileUrl={nominee.performerProfileUrl}
                              performerProfilePath={nominee.performerProfilePath}
                              songTitle={nominee.songTitle}
                            />
                          }
                        >
                          {pill}
                        </Tooltip>
                      ) : (
                        pill
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        ) : (
          <UnstyledButton
            type="button"
            className="dr-railToggle"
            aria-label="Expand draft history"
            onClick={() => {
              if (isPre) return;
              if (compactRails) openRailExclusive("ledger");
              else setLedgerOpen(true);
            }}
          >
            <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
              history
            </Text>
          </UnstyledButton>
        )}
      </Box>

      <Box className="dr-middle" role="region" aria-label="Draft board" tabIndex={0}>
        <Box className="dr-middle-columns" aria-hidden="true">
          {Array.from({ length: midCols }, (_, idx) => (
            <Box key={`mid-col-${idx}`} className="dr-mid-col" />
          ))}
        </Box>

        <Box className="dr-masonry">
          {masonry.map((col, colIdx) => (
            <Box key={`col-${colIdx}`} className="dr-masonry-col">
              {col.map((b) => (
                <CategoryCard
                  key={b.id}
                  categoryId={b.id}
                  title={b.title}
                  icon={b.icon}
                  iconVariant={b.iconVariant}
                  unitKind={b.unitKind}
                  weight={b.weight}
                  nominees={b.nominees}
                  isKeyboardMode={keyboardCategoryId === b.id}
                  setKeyboardMode={setKeyboardCategoryId}
                  canDraftAction={props.canDraftAction}
                  onNomineeClick={props.onNomineeClick}
                  onNomineeDoubleClick={props.onNomineeDoubleClick}
                />
              ))}
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        className={[
          "dr-rail",
          "dr-rail-roster",
          myRosterOpen ? "is-open" : "is-collapsed"
        ].join(" ")}
      >
        {myRosterOpen ? (
          <Box className="dr-railPane">
            <Box className="dr-railPaneHeader">
              <Box className="dr-railPaneTitleRow">
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  patient_list
                </Text>
                <Text className="dr-railPaneTitle">My roster</Text>
              </Box>
              <UnstyledButton
                type="button"
                className="dr-railClose"
                aria-label="Collapse my roster"
                onClick={() => setMyRosterOpen(false)}
              >
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  chevron_right
                </Text>
              </UnstyledButton>
            </Box>
            <Box
              className="dr-railPaneBody"
              role="region"
              aria-label="My roster"
              tabIndex={0}
            >
              <Box className="dr-railList">
                {props.myPicks.length === 0 ? (
                  <Text className="dr-railEmpty">No picks yet</Text>
                ) : (
                  props.myPicks.map((p) => {
                    const nominee = props.nomineeById.get(p.nominationId) ?? null;
                    const pill = (
                      <Box
                        className={[
                          "dr-pill",
                          "dr-pill-static",
                          p.winner ? "is-winner" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        tabIndex={nominee ? 0 : undefined}
                        role={nominee ? "group" : undefined}
                        aria-label={
                          nominee ? `${nominee.categoryName}: ${p.label}` : undefined
                        }
                      >
                        {nominee ? (
                          <DraftCategoryIcon
                            icon={nominee.categoryIcon}
                            variant={nominee.categoryIconVariant}
                            className="dr-pill-icon"
                          />
                        ) : p.icon ? (
                          <DraftCategoryIcon
                            icon={p.icon}
                            variant="default"
                            className="dr-pill-icon"
                          />
                        ) : null}
                        <Text component="span" className="dr-pill-text" lineClamp={1}>
                          {p.label}
                        </Text>
                      </Box>
                    );
                    return (
                      <Box key={p.pickNumber} className="dr-railRow dr-rosterRow">
                        <Text className="dr-railMeta">{p.roundPick}</Text>
                        {nominee ? (
                          <Tooltip
                            events={NOMINEE_TOOLTIP_EVENTS}
                            withArrow={false}
                            position="bottom-start"
                            multiline
                            offset={10}
                            styles={NOMINEE_CARD_TOOLTIP_STYLES}
                            label={
                              <NomineeTooltipCard
                                unitKind={nominee.unitKind}
                                categoryName={nominee.categoryName}
                                filmTitle={nominee.filmTitle}
                                filmYear={nominee.filmYear}
                                filmPosterUrl={nominee.filmPosterUrl}
                                contributors={nominee.contributors}
                                performerName={nominee.performerName}
                                performerCharacter={nominee.performerCharacter}
                                performerProfileUrl={nominee.performerProfileUrl}
                                performerProfilePath={nominee.performerProfilePath}
                                songTitle={nominee.songTitle}
                              />
                            }
                          >
                            {pill}
                          </Tooltip>
                        ) : (
                          pill
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>
            </Box>
          </Box>
        ) : (
          <UnstyledButton
            type="button"
            className="dr-railToggle"
            aria-label="Expand my roster"
            onClick={() => {
              if (isPre) return;
              if (compactRails) openRailExclusive("roster");
              else setMyRosterOpen(true);
            }}
          >
            <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
              patient_list
            </Text>
          </UnstyledButton>
        )}
      </Box>

      <Box
        className={[
          "dr-rail",
          "dr-rail-autodraft",
          autoDraftOpen ? "is-open" : "is-collapsed"
        ].join(" ")}
      >
        {autoDraftOpen ? (
          <Box className="dr-railPane">
            <Box className="dr-railPaneHeader">
              <Box className="dr-railPaneTitleRow">
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  smart_toy
                </Text>
                <Text className="dr-railPaneTitle">Auto-draft</Text>
              </Box>
              <UnstyledButton
                type="button"
                className="dr-railClose"
                aria-label="Collapse auto-draft"
                onClick={() => setAutoDraftOpen(false)}
              >
                <Text
                  component="span"
                  className="mi-icon mi-icon-tiny"
                  aria-hidden="true"
                >
                  chevron_right
                </Text>
              </UnstyledButton>
            </Box>
            <Box
              className="dr-railPaneBody"
              role="region"
              aria-label="Auto-draft"
              tabIndex={0}
            >
              <Stack gap="sm">
                <Checkbox
                  checked={props.autodraft.enabled}
                  onChange={(e) => props.autodraft.setEnabled(e.currentTarget.checked)}
                  label="Enable auto-drafting"
                />

                <Select
                  label="Strategy"
                  value={props.autodraft.strategy}
                  onChange={(v) =>
                    props.autodraft.setStrategy(
                      (v as
                        | "random"
                        | "by_category"
                        | "alphabetical"
                        | "wisdom"
                        | "custom") ?? "random"
                    )
                  }
                  data={[
                    { value: "random", label: "Random" },
                    { value: "by_category", label: "By category" },
                    { value: "alphabetical", label: "Alphabetical" },
                    { value: "wisdom", label: "Wisdom of crowds" },
                    {
                      value: "custom",
                      label: "Custom",
                      disabled: props.autodraft.plans.length === 0
                    }
                  ]}
                  allowDeselect={false}
                />

                {props.autodraft.strategy === "custom" ? (
                  <Select
                    label="Plan"
                    placeholder={
                      props.autodraft.plans.length === 0
                        ? "No plans available"
                        : "Choose…"
                    }
                    value={
                      props.autodraft.selectedPlanId
                        ? String(props.autodraft.selectedPlanId)
                        : null
                    }
                    onChange={(v) =>
                      props.autodraft.setSelectedPlanId(v ? Number(v) : null)
                    }
                    data={props.autodraft.plans.map((p) => ({
                      value: String(p.id),
                      label: p.name
                    }))}
                    disabled={props.autodraft.plans.length === 0}
                    searchable
                    clearable
                  />
                ) : null}

                {props.autodraft.strategy === "custom" ? (
                  <Box>
                    {props.autodraft.list.length === 0 ? (
                      <Text className="muted">No nominees.</Text>
                    ) : (
                      <Stack gap={6}>
                        {props.autodraft.list.map((item) => {
                          const nominee = props.nomineeById.get(item.nominationId);
                          const isDrafted = props.draftedNominationIds.has(
                            item.nominationId
                          );
                          const pill = (
                            <Box
                              className={[
                                "dr-pill",
                                "dr-pill-static",
                                isDrafted ? "is-muted" : ""
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              tabIndex={nominee ? 0 : undefined}
                              role={nominee ? "group" : undefined}
                              aria-label={
                                nominee
                                  ? `${nominee.categoryName}: ${item.label}`
                                  : undefined
                              }
                            >
                              {nominee ? (
                                <DraftCategoryIcon
                                  icon={nominee.categoryIcon}
                                  variant={nominee.categoryIconVariant}
                                  className="dr-pill-icon"
                                />
                              ) : item.icon ? (
                                <DraftCategoryIcon
                                  icon={item.icon}
                                  variant="default"
                                  className="dr-pill-icon"
                                />
                              ) : null}
                              <Text
                                component="span"
                                className="dr-pill-text"
                                lineClamp={1}
                              >
                                {item.label}
                              </Text>
                            </Box>
                          );
                          return nominee ? (
                            <Tooltip
                              key={item.nominationId}
                              events={NOMINEE_TOOLTIP_EVENTS}
                              withArrow={false}
                              position="bottom-start"
                              multiline
                              offset={10}
                              styles={NOMINEE_CARD_TOOLTIP_STYLES}
                              label={
                                <NomineeTooltipCard
                                  unitKind={nominee.unitKind}
                                  categoryName={nominee.categoryName}
                                  filmTitle={nominee.filmTitle}
                                  filmYear={nominee.filmYear}
                                  filmPosterUrl={nominee.filmPosterUrl}
                                  contributors={nominee.contributors}
                                  performerName={nominee.performerName}
                                  performerCharacter={nominee.performerCharacter}
                                  performerProfileUrl={nominee.performerProfileUrl}
                                  performerProfilePath={nominee.performerProfilePath}
                                  songTitle={nominee.songTitle}
                                />
                              }
                            >
                              {pill}
                            </Tooltip>
                          ) : (
                            <Box key={item.nominationId}>{pill}</Box>
                          );
                        })}
                      </Stack>
                    )}
                  </Box>
                ) : null}
              </Stack>
            </Box>
          </Box>
        ) : (
          <UnstyledButton
            type="button"
            className="dr-railToggle"
            aria-label="Expand auto-draft"
            onClick={() => {
              if (compactRails) openRailExclusive("auto");
              else setAutoDraftOpen(true);
            }}
          >
            <Text component="span" className="mi-icon dr-railStubIcon" aria-hidden="true">
              smart_toy
            </Text>
          </UnstyledButton>
        )}
      </Box>
    </Box>
  );
}
