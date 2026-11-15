import { formatCountdownText, isCountdownActive } from "./countdown";

export type HeaderTone =
  "rest" | "paused" | "mine" | "countdown-primary" | "countdown-danger" | "final";

export type HeaderHeadlineKind = "name" | "clock" | "status";
export type HeaderKickerKind = "label" | "name";
export type HeaderGlyph = "timer" | "pause";
/** `gold` and `red` are the two phases of the last-seconds pulse; null before the first tick. */
export type HeaderCountdownPhase = "gold" | "red" | null;

export type HeaderStatus = {
  tone: HeaderTone;
  kicker: string | null;
  /** A label ("On the clock", "Your pick") or the active seat's name above the clock. */
  kickerKind: HeaderKickerKind | null;
  headline: string;
  headlineKind: HeaderHeadlineKind;
  glyph: HeaderGlyph | null;
  /** The Round and Pick cells show; false only when the centre spans the whole tab. */
  showStats: boolean;
  /** The stat cells show "—" instead of the live round and pick (before the draft starts). */
  statsBlank: boolean;
};

/** The last-seconds window applies to the drafter on the clock only, in a timed draft. */
export function isHeaderCountdownRunning(args: {
  isTimerDraft: boolean;
  draftStatus: string | null;
  isFinalResults: boolean;
  isMyTurn: boolean;
  timerRemainingMs: number | null;
}): boolean {
  return Boolean(
    args.isTimerDraft &&
    args.draftStatus === "IN_PROGRESS" &&
    !args.isFinalResults &&
    args.isMyTurn &&
    isCountdownActive(args.timerRemainingMs)
  );
}

const DRAFT_COMPLETE = "Draft complete";

/**
 * What the header tab says in each draft state: tone, kicker, headline and glyph.
 * Desktop and phone both render this; neither branches on draft state itself.
 */
export function computeHeaderStatus(args: {
  draftStatus: string | null;
  isFinalResults: boolean;
  /** Final results have a podium to show; without one the tab only says the draft is complete. */
  hasPodium: boolean;
  isTimerDraft: boolean;
  isMyTurn: boolean;
  countdownActive: boolean;
  countdownPhase: HeaderCountdownPhase;
  timerRemainingMs: number | null;
  clockText: string;
  /** Label of the seat on the clock; "—" when there is none. */
  activeLabel: string;
}): HeaderStatus {
  const base = {
    kicker: null,
    kickerKind: null,
    glyph: null,
    showStats: true,
    statsBlank: false
  } as const;

  if (args.isFinalResults) {
    return {
      ...base,
      tone: args.hasPodium ? "final" : "rest",
      headline: DRAFT_COMPLETE,
      headlineKind: "status",
      showStats: false
    };
  }
  if (args.draftStatus === "PENDING") {
    return {
      ...base,
      tone: "rest",
      headline: "Not started",
      headlineKind: "status",
      statsBlank: true
    };
  }
  if (args.draftStatus === "PAUSED") {
    return {
      ...base,
      tone: "paused",
      headline: "Paused",
      headlineKind: "status",
      glyph: "pause"
    };
  }
  if (args.draftStatus === "COMPLETED") {
    return {
      ...base,
      tone: "rest",
      headline: DRAFT_COMPLETE,
      headlineKind: "status",
      showStats: false
    };
  }

  if (args.countdownActive) {
    return {
      ...base,
      tone: args.countdownPhase === "gold" ? "countdown-primary" : "countdown-danger",
      kicker: "Your pick",
      kickerKind: "label",
      headline: formatCountdownText(args.timerRemainingMs ?? 0),
      headlineKind: "clock",
      glyph: "timer"
    };
  }

  const tone = args.isMyTurn ? "mine" : "rest";
  if (args.isTimerDraft) {
    return {
      ...base,
      tone,
      kicker: args.isMyTurn ? "Your pick" : args.activeLabel,
      kickerKind: args.isMyTurn ? "label" : "name",
      headline: args.clockText,
      headlineKind: "clock"
    };
  }
  return {
    ...base,
    tone,
    kicker: args.isMyTurn ? "Your pick" : "On the clock",
    kickerKind: "label",
    headline: args.activeLabel,
    headlineKind: "name"
  };
}
