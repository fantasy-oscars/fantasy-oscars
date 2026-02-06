import type { DraftRoomOrchestration } from "../../orchestration/draft";
import {
  Box,
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineColorScheme
} from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { NomineeTooltipCard } from "../../components/draft/NomineeTooltipCard";
import { SiteFooterFineprintOnly } from "../../layout/SiteFooter";
import { Link } from "react-router-dom";
import { useAuthContext } from "../../auth/context";
import { AnimalAvatarIcon } from "../../ui/animalAvatarIcon";
import { ANIMAL_AVATAR_KEYS } from "@fantasy-oscars/shared";
import { RuntimeBannerStack, useConfirm } from "../../notifications";

type MasonryItem = { estimatePx: number };

export function DraftRoomScreen(props: { o: DraftRoomOrchestration }) {
  const { user } = useAuthContext();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
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

  const { confirm } = useConfirm();

  const confirmTimerRef = useRef<number | null>(null);
  const confirmNominationRef = useRef<number | null>(null);

  const clearConfirmTimer = () => {
    if (confirmTimerRef.current) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  };

  const scheduleDraftConfirm = (args: { nominationId: number; label: string }) => {
    clearConfirmTimer();
    confirmNominationRef.current = args.nominationId;

    confirmTimerRef.current = window.setTimeout(() => {
      const nominationId = confirmNominationRef.current;
      if (!nominationId) return;

      void confirm({
        title: "Confirm draft pick",
        message: `Draft “${args.label}”?`,
        confirmLabel: "Draft",
        cancelLabel: "Undo"
      }).then((ok) => {
        if (ok) props.o.myRoster.submitPickNomination(nominationId);
        else props.o.myRoster.clearSelection();
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
  // The body is divided into 7.75 "units".
  const categories = props.o.pool.categories.map((c) => ({
    id: String(c.id),
    title: c.title,
    icon: c.icon,
    iconVariant: c.iconVariant ?? "default",
    unitKind: c.unitKind ?? "",
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
    const m = new Map<number, {
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
    }>();

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
    }
    return () => clearConfirmTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDraftAction]);

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
        showDraftedVisible={!isCompleted && (isPre ? true : props.o.header.view === "draft")}
        themeIcon={colorScheme === "dark" ? "\ue518" : "\ue51c"}
        onToggleTheme={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")}
        showDraftControls={!isCompleted}
        canManageDraft={isPreview ? true : props.o.header.canManageDraft}
        onStartDraft={props.o.header.onStartDraft}
        onPauseDraft={props.o.header.onPauseDraft}
        onResumeDraft={props.o.header.onResumeDraft}
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
              scheduleDraftConfirm({ nominationId: id, label });
            }}
            onNomineeDoubleClick={(id) => {
              if (!canDraftAction) return;
              clearConfirmTimer();
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

function DraftBoardHeader(props: {
  backHref: string | null;
  participants: Array<{
    seatNumber: number;
    label: string;
    active: boolean;
    avatarKey: string | null;
  }>;
  direction: "FORWARD" | "REVERSE" | null;
  roundNumber: number | null;
  pickNumber: number | null;
  isTimerDraft: boolean;
  clockText: string;
  draftStatus: string | null;
  isFinalResults: boolean;
  resultsWinnerLabel: string | null;
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
  userLabel: string;
  userAvatarKey: string | null;
}) {
  const isPre = props.draftStatus === "PENDING";
  const isPaused = props.draftStatus === "PAUSED";
  const isCompleted = props.draftStatus === "COMPLETED";

  const activeIndexRaw = props.participants.findIndex((p) => p.active);
  const activeIndex = activeIndexRaw >= 0 ? activeIndexRaw : 0;
  const activeLabel = props.participants[activeIndex]?.label ?? "—";
  const centerText = (() => {
    if (props.isFinalResults) {
      const raw = props.resultsWinnerLabel?.trim();
      if (!raw) return "Draft complete";
      return raw.startsWith("Tie:") ? raw : `Winner: ${raw}`;
    }
    if (isPaused) return "Paused";
    if (isPre) return "Not started";
    if (isCompleted) return "Draft complete";
    return props.isTimerDraft ? props.clockText : activeLabel;
  })();

  const buckleMaxPx = useMemo(() => {
    // Defensive default: ~25% of viewport, clamped.
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    return Math.min(360, Math.max(200, Math.floor(vw * 0.25)));
  }, []);

  return (
    <Box className="dr-header">
      <Box className="drh-row">
        <Box className="drh-left">
          <Box className="drh-backWrap" aria-hidden={false}>
            <UnstyledButton
              component={Link}
              to={props.backHref ?? "#"}
              className={["drh-back", props.backHref ? "" : "is-disabled"].join(" ")}
              aria-label="Back to season"
              onClick={(e) => {
                if (!props.backHref) e.preventDefault();
              }}
            >
              <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                arrow_back
              </Text>
            </UnstyledButton>
          </Box>
          {!isCompleted && (
            <ParticipantStrip
              participants={props.participants}
              activeIndex={activeIndex}
              direction={props.direction}
              suppressActive={isPre || isPaused || isCompleted}
            />
          )}
        </Box>

        <Box className="drh-right">
          {props.showDraftControls && props.canManageDraft && (
            <Box className="drh-pauseWrap">
              <UnstyledButton
                type="button"
                className="drh-pause"
                aria-label={
                  isPre ? "Start draft" : isPaused ? "Resume draft" : "Pause draft"
                }
                onClick={() => {
                  if (isPre) props.onStartDraft();
                  else if (isPaused) props.onResumeDraft();
                  else props.onPauseDraft();
                }}
              >
                <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                  {isPre || isPaused ? "play_arrow" : "pause"}
                </Text>
              </UnstyledButton>
            </Box>
          )}
          {props.showDraftControls ? (
            <Box className="drh-controls">
            <Box className="drh-controlsGrid">
              <Group className="drh-controlRow" gap="sm" wrap="nowrap">
                <Text className="drh-label">View</Text>
                <SegmentedControl
                  size="xs"
                  value={props.view}
                  onChange={(v) => props.onViewChange(v as "draft" | "roster")}
                  data={[
                    { value: "draft", label: "Draft" },
                    { value: "roster", label: "Roster" }
                  ]}
                  disabled={!props.canToggleView}
                />
              </Group>

              <Group className="drh-controlRow" gap="sm" wrap="nowrap">
                <Text className="drh-label">Show drafted</Text>
                <Box className="drh-toggleSlot">
                  {props.showDraftedVisible ? (
                    <Switch
                      size="sm"
                      checked={props.showDrafted}
                      onChange={(e) => props.onToggleShowDrafted(e.currentTarget.checked)}
                    />
                  ) : (
                    <Box className="drh-togglePlaceholder" aria-hidden="true" />
                  )}
                </Box>
              </Group>
            </Box>
          </Box>
          ) : null}

          <Group className="drh-stowaways" gap="xs" wrap="nowrap">
            <Button
              type="button"
              variant="subtle"
              className="theme-toggle"
              onClick={props.onToggleTheme}
              aria-label="Toggle theme"
            >
              <Text component="span" className="gicon" aria-hidden="true">
                {props.themeIcon}
              </Text>
            </Button>
            <Box className="drh-userBadge">
              <AnimalAvatarIcon avatarKey={props.userAvatarKey} size={24} />
              <Text className="drh-userText">{props.userLabel}</Text>
            </Box>
          </Group>
        </Box>

        <CenterBuckle
          roundNumber={isCompleted ? null : props.roundNumber}
          pickNumber={isCompleted ? null : props.pickNumber}
          centerText={centerText}
          measureText={
            props.isTimerDraft
              ? null
              : props.participants.reduce((longest, p) =>
                  p.label.length > longest.length ? p.label : longest,
                "")
          }
          isTimerDraft={props.isTimerDraft}
          maxHandleLengthPx={buckleMaxPx}
        />
      </Box>
    </Box>
  );
}

function ParticipantStrip(props: {
  participants: Array<{
    seatNumber: number;
    label: string;
    active: boolean;
    avatarKey: string | null;
  }>;
  activeIndex: number;
  direction: "FORWARD" | "REVERSE" | null;
  suppressActive?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const minTokens = 4;
  const n = props.participants.length;
  const debugRef = useRef<string>("");
  const active = props.suppressActive
    ? 0
    : Math.min(Math.max(0, props.activeIndex), Math.max(0, n - 1));

  const [capacity, setCapacity] = useState(() => Math.max(1, Math.min(n, 8)));
  const windowRef = useRef<{ start: number; end: number }>({ start: 0, end: Math.min(n, capacity) });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      // Measure actual stride from rendered DOM (Mantine Group gap + token wrap width),
      // rather than hard-coding widths, which can desync as styles change.
      const style = window.getComputedStyle(el);
      const gapRaw =
        // `gap` is standard; `columnGap` is a fallback for older engines.
        style.gap || style.columnGap || "0";
      const gapPx = Number.parseFloat(gapRaw) || 0;
      const tokenEl = el.querySelector<HTMLElement>(".drh-tokenWrap,.drh-token");
      const tokenW = tokenEl ? tokenEl.getBoundingClientRect().width : 33;
      const stride = Math.max(1, tokenW + gapPx);

      const w = el.clientWidth;
      // Small safety margin so we don't visually crowd the buckle at the center.
      const usable = Math.max(0, w - 8);
      // When there are only a few participants, always show them (even if our stride
      // estimate is briefly wrong during layout), to avoid the confusing 1-token collapse.
      const fit = Math.floor(usable / stride);
      const nextCap = n <= minTokens ? n : Math.max(1, Math.min(fit, n));

      const debugEnabled =
        typeof window !== "undefined" && Boolean((window as unknown as { __FO_DEBUG_STRIP__?: boolean }).__FO_DEBUG_STRIP__);
      if (debugEnabled) {
        const payload = JSON.stringify({
          n,
          minTokens,
          w,
          usable,
          gapRaw,
          gapPx,
          tokenW,
          stride,
          fit,
          nextCap,
          capacity
        });
        if (payload !== debugRef.current) {
          // eslint-disable-next-line no-console
          console.log("[ParticipantStrip]", JSON.parse(payload));
          debugRef.current = payload;
        }
      }
      setCapacity((prev) => (prev === nextCap ? prev : nextCap));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  const nextIndex = props.suppressActive
    ? active
    : props.direction === "REVERSE"
      ? Math.max(0, active - 1)
      : Math.min(n - 1, active + 1);
  const windowSize = Math.min(n, Math.max(1, capacity));

  let { start, end } = windowRef.current;
  if (end - start !== windowSize) {
    start = 0;
    end = Math.min(n, windowSize);
  }

  const needsSlide =
    !(active >= start && active < end) || !(nextIndex >= start && nextIndex < end);
  if (needsSlide) {
    // Slide just enough to include current + next.
    const minNeeded = Math.min(active, nextIndex);
    const maxNeeded = Math.max(active, nextIndex);
    start = Math.max(0, Math.min(minNeeded, maxNeeded - (windowSize - 1)));
    end = Math.min(n, start + windowSize);
    start = Math.max(0, end - windowSize);
    windowRef.current = { start, end };
  }

  const headHidden = start;
  const tailHidden = n - end;

  const visible = props.participants.slice(start, end);

  if (n === 0) return <Box className="drh-strip" ref={ref} />;

  // Only use the super-collapsed summary when there are *more* participants than we can
  // reasonably show. If there are fewer than `minTokens` total, show them all.
  if (windowSize < Math.min(minTokens, n) && n > 0) {
    const debugEnabled =
      typeof window !== "undefined" && Boolean((window as unknown as { __FO_DEBUG_STRIP__?: boolean }).__FO_DEBUG_STRIP__);
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.log("[ParticipantStrip] super-collapsed", {
        windowSize,
        minTokens,
        n,
        capacity,
        start,
        end
      });
    }
    const current = props.participants[active];
    return (
      <Tooltip
        label={
          <Box className="drh-stripTip">
            {props.participants.map((p) => (
              <Box key={`all-${p.seatNumber}`} className="drh-tipRow">
                <AvatarToken label={p.label} avatarKey={p.avatarKey} active={p.active} />
                <Text className="drh-tipText">{p.label}</Text>
              </Box>
            ))}
          </Box>
        }
      >
        <Box className="drh-strip" ref={ref}>
          <Box className="drh-tokenWrap">
            <AvatarToken label={current.label} avatarKey={current.avatarKey} active />
            <DirectionChevron direction={props.direction} />
          </Box>
        </Box>
      </Tooltip>
    );
  }

  return (
    <Group className="drh-strip" gap={8} wrap="nowrap" ref={ref}>
      {headHidden > 0 && (
        <Tooltip
          label={
            <Box className="drh-stripTip">
              {props.participants.slice(0, start).map((p) => (
                <Box key={`h-${p.seatNumber}`} className="drh-tipRow">
                  <AvatarToken label={p.label} avatarKey={p.avatarKey} active={false} />
                  <Text className="drh-tipText">{p.label}</Text>
                </Box>
              ))}
            </Box>
          }
        >
          <Box className="drh-token drh-overflow" aria-label={`${headHidden} more`}>
            <Text className="drh-overflowText">+{headHidden}</Text>
          </Box>
        </Tooltip>
      )}

      {visible.map((p, idx) => {
        const isActive = !props.suppressActive && start + idx === active;
        return (
          <Tooltip key={p.seatNumber} label={p.label} withArrow>
            <Box className="drh-tokenWrap">
              <AvatarToken
                label={p.label}
                avatarKey={p.avatarKey}
                active={isActive}
              />
              {isActive && <DirectionChevron direction={props.direction} />}
            </Box>
          </Tooltip>
        );
      })}

      {tailHidden > 0 && (
        <Tooltip
          label={
            <Box className="drh-stripTip">
              {props.participants.slice(end).map((p) => (
                <Box key={`t-${p.seatNumber}`} className="drh-tipRow">
                  <AvatarToken label={p.label} avatarKey={p.avatarKey} active={false} />
                  <Text className="drh-tipText">{p.label}</Text>
                </Box>
              ))}
            </Box>
          }
        >
          <Box className="drh-token drh-overflow" aria-label={`${tailHidden} more`}>
            <Text className="drh-overflowText">+{tailHidden}</Text>
          </Box>
        </Tooltip>
      )}
    </Group>
  );
}

function AvatarToken(props: { label: string; avatarKey: string | null; active: boolean }) {
  const avatarKey = props.avatarKey ?? pickDeterministicAvatarKey(props.label);
  return (
    <Box className={["drh-token", props.active ? "is-active" : ""].join(" ")}>
      <AnimalAvatarIcon avatarKey={avatarKey} size={33} />
    </Box>
  );
}

function pickDeterministicAvatarKey(label: string): string {
  // Stable, non-color-dependent identity: map the handle to an animal key.
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return ANIMAL_AVATAR_KEYS[hash % ANIMAL_AVATAR_KEYS.length] ?? "monkey";
}

function DirectionChevron(props: { direction: "FORWARD" | "REVERSE" | null }) {
  const glyph = props.direction === "REVERSE" ? "chevron_left" : "chevron_right";
  return (
    <Text component="span" className="drh-chevron mi-icon mi-icon-tiny" aria-hidden="true">
      {glyph}
    </Text>
  );
}

function CenterBuckle(props: {
  roundNumber: number | null;
  pickNumber: number | null;
  centerText: string;
  measureText: string | null;
  isTimerDraft: boolean;
  maxHandleLengthPx: number;
}) {
  // Keep buckle width stable. For untimed drafts we clamp to a defensible max width
  // (derived from viewport) and rely on text truncation rather than dynamic measuring.
  const centerPx = props.isTimerDraft ? 140 : props.maxHandleLengthPx;

  return (
    <Box
      className="drh-buckle"
      data-mode={props.isTimerDraft ? "timer" : "non-timer"}
      style={
        {
          ["--drh-buckle-max" as never]: `${centerPx}px`
        } as React.CSSProperties
      }
    >
      {props.roundNumber !== null && (
        <Box className="drh-buckleStack">
          <Text className="drh-buckleLabel">Round</Text>
          <Text className="drh-buckleNumber">{props.roundNumber ?? "—"}</Text>
        </Box>
      )}
      <Text className="drh-buckleCenter" lineClamp={1}>
        {props.centerText}
      </Text>
      {props.pickNumber !== null && (
        <Box className="drh-buckleStack">
          <Text className="drh-buckleLabel">Pick</Text>
          <Text className="drh-buckleNumber">{props.pickNumber ?? "—"}</Text>
        </Box>
      )}
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

  const [ledgerOpen, setLedgerOpen] = useState(!isPre);
  const [myRosterOpen, setMyRosterOpen] = useState(!isPre);
  const [autoDraftOpen, setAutoDraftOpen] = useState(true);

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

  const expandedCount = (ledgerOpen ? 1 : 0) + (myRosterOpen ? 1 : 0) + (autoDraftOpen ? 1 : 0);
  const midCols = Math.max(1, 7 - expandedCount);

  const boxes = props.categories.map((c) => ({
    id: c.id,
    title: c.title,
    icon: c.icon,
    iconVariant: c.iconVariant,
    unitKind: c.unitKind,
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
              <Text className="dr-railPaneTitle">Draft History</Text>
              <UnstyledButton
                type="button"
                className="dr-railClose"
                aria-label="Collapse draft history"
                onClick={() => setLedgerOpen(false)}
              >
                <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                  chevron_left
                </Text>
              </UnstyledButton>
            </Box>
            <Box className="dr-railPaneBody">
              <Box className="dr-railList">
                {props.ledgerRows.map((r) => {
                  const nominee = r.nominationId ? props.nomineeById.get(r.nominationId) ?? null : null;
                  const avatarKey =
                    r.seatNumber !== null
                      ? (props.avatarKeyBySeat.get(r.seatNumber) ?? pickDeterministicAvatarKey(r.seatLabel))
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
                    >
                      {nominee ? (
                        <DraftCategoryIcon
                          icon={nominee.categoryIcon}
                          variant={nominee.categoryIconVariant}
                          className="dr-pill-icon"
                        />
                      ) : r.icon ? (
                        <DraftCategoryIcon icon={r.icon} variant="default" className="dr-pill-icon" />
                      ) : null}
                      <Text component="span" className="dr-pill-text" lineClamp={1}>
                        {r.label}
                      </Text>
                    </Box>
                  );

                  return (
                    <Box key={r.pickNumber} className="dr-railRow dr-ledgerRow" data-active={r.active ? "true" : "false"}>
                      <Text className="dr-railMeta">{r.roundPick}</Text>
                      <Box className="dr-railAvatar">
                        <AnimalAvatarIcon avatarKey={avatarKey} size={22} />
                      </Box>
                      {nominee ? (
                        <Tooltip
                          withArrow
                          position="bottom-start"
                          multiline
                          offset={10}
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
            onClick={() => {
              if (isPre) return;
              setLedgerOpen(true);
            }}
          >
            <Text component="span" className="dr-rail-label">
              Ledger
            </Text>
          </UnstyledButton>
        )}
      </Box>

      <Box className="dr-middle">
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
                  title={b.title}
                  icon={b.icon}
                  iconVariant={b.iconVariant}
                  unitKind={b.unitKind}
                  nominees={b.nominees}
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
              <Text className="dr-railPaneTitle">My roster</Text>
              <UnstyledButton
                type="button"
                className="dr-railClose"
                aria-label="Collapse my roster"
                onClick={() => setMyRosterOpen(false)}
              >
                <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                  chevron_right
                </Text>
              </UnstyledButton>
            </Box>
            <Box className="dr-railPaneBody">
              <Box className="dr-railList">
                {props.myPicks.length === 0 ? (
                  <Text className="dr-railEmpty">No picks yet</Text>
                ) : (
                  props.myPicks.map((p) => {
                    const nominee = props.nomineeById.get(p.nominationId) ?? null;
                    const pill = (
                      <Box
                        className={["dr-pill", "dr-pill-static", p.winner ? "is-winner" : ""]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {nominee ? (
                          <DraftCategoryIcon
                            icon={nominee.categoryIcon}
                            variant={nominee.categoryIconVariant}
                            className="dr-pill-icon"
                          />
                        ) : p.icon ? (
                          <DraftCategoryIcon icon={p.icon} variant="default" className="dr-pill-icon" />
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
                            withArrow
                            position="bottom-start"
                            multiline
                            offset={10}
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
            onClick={() => {
              if (isPre) return;
              setMyRosterOpen(true);
            }}
          >
            <Text component="span" className="dr-rail-label dr-rail-label-right">
              My roster
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
              <Text className="dr-railPaneTitle">Auto-draft</Text>
              <UnstyledButton
                type="button"
                className="dr-railClose"
                aria-label="Collapse auto-draft"
                onClick={() => setAutoDraftOpen(false)}
              >
                <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
                  chevron_right
                </Text>
              </UnstyledButton>
            </Box>
            <Box className="dr-railPaneBody">
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
                    props.autodraft.setStrategy((v as "random" | "custom") ?? "random")
                  }
                  data={[
                    { value: "random", label: "Random" },
                    {
                      value: "custom",
                      label: "Custom",
                      disabled: props.autodraft.plans.length === 0
                    }
                  ]}
                  allowDeselect={false}
                />

                {props.autodraft.strategy === "custom" ? (
                  <>
                    <Select
                      label="Plan"
                      placeholder={
                        props.autodraft.plans.length === 0 ? "No plans available" : "Choose…"
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

                    {props.autodraft.selectedPlanId ? (
                      <Box>
                        {props.autodraft.list.length === 0 ? (
                          <Text className="muted">No nominees.</Text>
                        ) : (
                          <Stack gap={6}>
                            {props.autodraft.list.map((item) => {
                              const nominee = props.nomineeById.get(item.nominationId);
                              const isDrafted = props.draftedNominationIds.has(item.nominationId);
                              const pill = (
                                <Box
                                  className={[
                                    "dr-pill",
                                    "dr-pill-static",
                                    isDrafted ? "is-muted" : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
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
                                  <Text component="span" className="dr-pill-text" lineClamp={1}>
                                    {item.label}
                                  </Text>
                                </Box>
                              );
                              return nominee ? (
                                <Tooltip
                                  key={item.nominationId}
                                  withArrow
                                  position="bottom-start"
                                  multiline
                                  offset={10}
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
                  </>
                ) : null}
              </Stack>
            </Box>
          </Box>
        ) : (
          <UnstyledButton
            type="button"
            className="dr-railToggle"
            onClick={() => setAutoDraftOpen(true)}
          >
            <Text component="span" className="dr-rail-label dr-rail-label-right">
              Auto-draft
            </Text>
          </UnstyledButton>
        )}
      </Box>
    </Box>
  );
}

function DraftCategoryIcon(props: { icon: string; variant: "default" | "inverted"; className?: string }) {
  if (props.variant === "inverted") {
    return (
      <Box
        component="span"
        className={["mi-icon mi-icon-tiny dr-icon-punchout", props.className ?? ""].join(" ")}
        aria-hidden="true"
      >
        {props.icon}
      </Box>
    );
  }
  return (
    <Box
      component="span"
      className={["mi-icon mi-icon-tiny", props.className ?? ""].join(" ")}
      aria-hidden="true"
    >
      {props.icon}
    </Box>
  );
}

function RosterBoardScaffold(props: {
  o: DraftRoomOrchestration;
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
}) {
  const { o } = props;

  const participantsBySeat = useMemo(() => {
    const m = new Map<number, { label: string; avatarKey: string | null }>();
    for (const p of o.header.participants) {
      m.set(p.seatNumber, { label: p.label, avatarKey: p.avatarKey ?? null });
    }
    return m;
  }, [o.header.participants]);

  const players = useMemo(() => {
    const seats = o.rosterBoard.seats.length
      ? o.rosterBoard.seats
      : o.header.participants.map((p) => ({
          seatNumber: p.seatNumber,
          username: p.label,
          winnerCount: 0
        }));
    return [...seats]
      .sort((a, b) => a.seatNumber - b.seatNumber)
      .map((s) => {
        const p = participantsBySeat.get(s.seatNumber);
        const label = s.username ?? p?.label ?? `Seat ${s.seatNumber}`;
        const avatarKey = p?.avatarKey ?? pickDeterministicAvatarKey(label);
        return { seatNumber: s.seatNumber, label, avatarKey, winnerCount: s.winnerCount ?? 0 };
      });
  }, [o.header.participants, o.rosterBoard.seats, participantsBySeat]);

  const [startIdx, setStartIdx] = useState(0);
  const maxVisible = 6;

  useEffect(() => {
    setStartIdx((prev) => {
      const maxStart = Math.max(0, players.length - maxVisible);
      return Math.min(prev, maxStart);
    });
  }, [players.length]);

  const canPrev = startIdx > 0;
  const canNext = startIdx + maxVisible < players.length;
  const visible = players.slice(startIdx, startIdx + maxVisible);

  return (
    <Box className="dr-middle dr-roster">
      {players.length > maxVisible ? (
        <>
          <UnstyledButton
            type="button"
            className={["dr-rosterNav", "is-left", canPrev ? "" : "is-disabled"].join(" ")}
            aria-label="Previous players"
            onClick={() => canPrev && setStartIdx((v) => Math.max(0, v - 1))}
          >
            <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
              chevron_left
            </Text>
          </UnstyledButton>
          <UnstyledButton
            type="button"
            className={["dr-rosterNav", "is-right", canNext ? "" : "is-disabled"].join(" ")}
            aria-label="Next players"
            onClick={() =>
              canNext && setStartIdx((v) => Math.min(players.length - maxVisible, v + 1))
            }
          >
            <Text component="span" className="mi-icon mi-icon-tiny" aria-hidden="true">
              chevron_right
            </Text>
          </UnstyledButton>
        </>
      ) : null}

      <Box
        className="dr-rosterGrid"
        style={
          {
            ["--roster-unit" as never]: "calc(100vw / 6.25)",
            ["--roster-cols" as never]: visible.length
          } as React.CSSProperties
        }
      >
        {visible.map((p) => {
          const picks = o.rosterBoard.rowsBySeat.get(p.seatNumber) ?? [];
          return (
            <Box key={p.seatNumber} className="dr-rosterCol">
                <Box className="dr-card dr-rosterCard">
                  <Box className="dr-card-titleRow">
                    <AnimalAvatarIcon avatarKey={p.avatarKey} size={24} />
                    <Text className="dr-card-title" lineClamp={1} style={{ flex: "1 1 auto" }}>
                      {p.label}
                    </Text>
                    <Text className="dr-rosterWinCount" aria-label={`${p.winnerCount} winners`}>
                      {p.winnerCount}
                    </Text>
                  </Box>
                <Stack gap={6} className="dr-card-pills">
                  {picks.map((pick) => {
                    const nominee =
                      pick.nominationId != null
                        ? props.nomineeById.get(pick.nominationId) ?? null
                        : null;

                    const pill = (
                      <Box
                        className={[
                          "dr-pill",
                          "dr-pill-static",
                          pick.winner ? "is-winner" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {nominee ? (
                          <DraftCategoryIcon
                            icon={nominee.categoryIcon}
                            variant={nominee.categoryIconVariant}
                            className="dr-pill-icon"
                          />
                        ) : pick.icon ? (
                          <DraftCategoryIcon
                            icon={pick.icon}
                            variant="default"
                            className="dr-pill-icon"
                          />
                        ) : null}
                        <Text className="dr-pill-text dr-rosterPickText" lineClamp={1}>
                          {pick.label}
                        </Text>
                      </Box>
                    );

                    return (
                      <Box key={`${p.seatNumber}-${pick.pickNumber}`}>
                        {nominee ? (
                          <Tooltip
                            withArrow
                            position="bottom-start"
                            multiline
                            offset={10}
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
                </Stack>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function estimateCategoryCardHeightPx(pillCount: number) {
  // Intentionally approximate; it should remain stable across small style tweaks.
  const padY = 20; // top+bottom
  const title = 22; // line-height-ish
  const titleGap = 10; // space under title
  const pillH = 22;
  const pillGap = 6;
  const count = Math.max(1, pillCount);
  const pills = count * pillH + Math.max(0, count - 1) * pillGap;
  return padY + title + titleGap + pills;
}

function computeMasonry<T extends MasonryItem>(colCount: number, items: T[]) {
  const cols: T[][] = Array.from({ length: colCount }, () => []);
  const heights = Array.from({ length: colCount }, () => 0);

  for (const item of items) {
    let minIdx = 0;
    for (let i = 1; i < heights.length; i += 1) {
      if (heights[i] < heights[minIdx]) minIdx = i;
    }
    cols[minIdx].push(item);
    heights[minIdx] += item.estimatePx;
  }

  return cols;
}

function CategoryCard(props: {
  title: string;
  icon: string;
  iconVariant: "default" | "inverted";
  unitKind: string;
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
  canDraftAction: boolean;
  onNomineeClick: (nominationId: number, label: string) => void;
  onNomineeDoubleClick: (nominationId: number) => void;
}) {
  return (
    <Box className="dr-card">
      <Box className="dr-card-titleRow">
        <DraftCategoryIcon icon={props.icon} variant={props.iconVariant} />
        <Text className="dr-card-title">{props.title}</Text>
      </Box>
      <Box className="dr-card-pills">
        {props.nominees.length === 0 ? (
          <Box className="dr-pill is-muted">
            <Text component="span" className="dr-pill-text">
              No nominees
            </Text>
          </Box>
        ) : (
          props.nominees.map((n) => (
            <Tooltip
              key={n.id}
              withArrow
              position="bottom-start"
              multiline
              offset={10}
              label={
                <NomineeTooltipCard
                  unitKind={props.unitKind}
                  categoryName={props.title}
                  filmTitle={n.filmTitle}
                  filmYear={n.filmYear}
                  filmPosterUrl={n.posterUrl}
                  contributors={n.contributors}
                  performerName={n.performerName}
                  performerCharacter={n.performerCharacter}
                  performerProfileUrl={n.performerProfileUrl}
                  performerProfilePath={n.performerProfilePath}
                  songTitle={n.songTitle}
                />
              }
            >
              <UnstyledButton
                type="button"
                className={[
                  "dr-pill",
                  "dr-pill-btn",
                  n.muted ? "is-muted" : "",
                  n.winner ? "is-winner" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={(e) => {
                  if (!props.canDraftAction) return;
                  e.preventDefault();
                  e.stopPropagation();
                  props.onNomineeClick(Number(n.id), n.label);
                }}
                onDoubleClick={(e) => {
                  if (!props.canDraftAction) return;
                  e.preventDefault();
                  e.stopPropagation();
                  props.onNomineeDoubleClick(Number(n.id));
                }}
              >
                <Text component="span" className="dr-pill-text">
                  {n.label}
                </Text>
              </UnstyledButton>
            </Tooltip>
          ))
        )}
      </Box>
    </Box>
  );
}
