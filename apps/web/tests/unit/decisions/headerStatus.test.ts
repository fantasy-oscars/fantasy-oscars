import { describe, expect, it } from "vitest";
import {
  computeHeaderStatus,
  isHeaderCountdownRunning
} from "@/decisions/draft/headerStatus";

const base = {
  draftStatus: "IN_PROGRESS",
  isFinalResults: false,
  hasPodium: false,
  isTimerDraft: false,
  isMyTurn: false,
  countdownActive: false,
  countdownPhase: null,
  timerRemainingMs: null,
  clockText: "1:30",
  activeLabel: "Blake"
} as const;

describe("computeHeaderStatus", () => {
  it("pre-draft: rest, dashes in the stat cells, no kicker, centred status", () => {
    expect(computeHeaderStatus({ ...base, draftStatus: "PENDING" })).toEqual({
      tone: "rest",
      kicker: null,
      kickerKind: null,
      headline: "Not started",
      headlineKind: "status",
      glyph: null,
      showStats: true,
      statsBlank: true
    });
  });

  it("paused: paused tone with the pause glyph and live stats", () => {
    expect(computeHeaderStatus({ ...base, draftStatus: "PAUSED" })).toEqual({
      tone: "paused",
      kicker: null,
      kickerKind: null,
      headline: "Paused",
      headlineKind: "status",
      glyph: "pause",
      showStats: true,
      statsBlank: false
    });
  });

  it("others' turn, no timer: 'On the clock' over the active seat's name", () => {
    expect(computeHeaderStatus(base)).toEqual({
      tone: "rest",
      kicker: "On the clock",
      kickerKind: "label",
      headline: "Blake",
      headlineKind: "name",
      glyph: null,
      showStats: true,
      statsBlank: false
    });
  });

  it("my turn, no timer: 'Your pick' over my name on the mine tone", () => {
    expect(
      computeHeaderStatus({ ...base, isMyTurn: true, activeLabel: "Alice" })
    ).toEqual({
      tone: "mine",
      kicker: "Your pick",
      kickerKind: "label",
      headline: "Alice",
      headlineKind: "name",
      glyph: null,
      showStats: true,
      statsBlank: false
    });
  });

  it("timer running, others: the active seat's name over the clock", () => {
    expect(computeHeaderStatus({ ...base, isTimerDraft: true })).toEqual({
      tone: "rest",
      kicker: "Blake",
      kickerKind: "name",
      headline: "1:30",
      headlineKind: "clock",
      glyph: null,
      showStats: true,
      statsBlank: false
    });
  });

  it("timer running, mine: 'Your pick' over the clock on the mine tone", () => {
    expect(computeHeaderStatus({ ...base, isTimerDraft: true, isMyTurn: true })).toEqual({
      tone: "mine",
      kicker: "Your pick",
      kickerKind: "label",
      headline: "1:30",
      headlineKind: "clock",
      glyph: null,
      showStats: true,
      statsBlank: false
    });
  });

  it("countdown: the words and the timer glyph in both phases", () => {
    const countdown = {
      ...base,
      isTimerDraft: true,
      isMyTurn: true,
      countdownActive: true,
      timerRemainingMs: 3200
    };
    for (const phase of ["gold", "red"] as const) {
      const status = computeHeaderStatus({ ...countdown, countdownPhase: phase });
      expect(status).toMatchObject({
        kicker: "Your pick",
        headline: "4s left",
        headlineKind: "clock",
        glyph: "timer",
        showStats: true
      });
    }
  });

  it("maps the countdown phase to a tone, holding danger before the first tick", () => {
    const countdown = {
      ...base,
      isTimerDraft: true,
      isMyTurn: true,
      countdownActive: true,
      timerRemainingMs: 4000
    };
    expect(computeHeaderStatus({ ...countdown, countdownPhase: "gold" }).tone).toBe(
      "countdown-primary"
    );
    expect(computeHeaderStatus({ ...countdown, countdownPhase: "red" }).tone).toBe(
      "countdown-danger"
    );
    expect(computeHeaderStatus({ ...countdown, countdownPhase: null }).tone).toBe(
      "countdown-danger"
    );
  });

  it("preview: reads as my turn", () => {
    const status = computeHeaderStatus({
      ...base,
      isMyTurn: true,
      activeLabel: "Alice"
    });
    expect(status).toMatchObject({
      tone: "mine",
      kicker: "Your pick",
      headline: "Alice"
    });
  });

  it("draft complete: rest tone, no stat cells, centre spans the tab", () => {
    expect(computeHeaderStatus({ ...base, draftStatus: "COMPLETED" })).toEqual({
      tone: "rest",
      kicker: null,
      kickerKind: null,
      headline: "Draft complete",
      headlineKind: "status",
      glyph: null,
      showStats: false,
      statsBlank: false
    });
  });

  it("final results with a podium: the final tone, whatever the draft status says", () => {
    const status = computeHeaderStatus({
      ...base,
      draftStatus: "COMPLETED",
      isFinalResults: true,
      hasPodium: true,
      isMyTurn: true
    });
    expect(status).toMatchObject({ tone: "final", glyph: null, showStats: false });
  });

  it("final results with no podium resolved: rest, Draft complete", () => {
    const status = computeHeaderStatus({
      ...base,
      draftStatus: "COMPLETED",
      isFinalResults: true,
      hasPodium: false
    });
    expect(status).toMatchObject({
      tone: "rest",
      headline: "Draft complete",
      headlineKind: "status",
      showStats: false
    });
  });
});

describe("isHeaderCountdownRunning", () => {
  const live = {
    isTimerDraft: true,
    draftStatus: "IN_PROGRESS",
    isFinalResults: false,
    isMyTurn: true,
    timerRemainingMs: 4000
  };

  it("runs in the last five seconds of my timed turn", () => {
    expect(isHeaderCountdownRunning(live)).toBe(true);
    expect(isHeaderCountdownRunning({ ...live, timerRemainingMs: 5000 })).toBe(true);
  });

  it("does not run outside the window, for others, untimed, paused or in results", () => {
    expect(isHeaderCountdownRunning({ ...live, timerRemainingMs: 5001 })).toBe(false);
    expect(isHeaderCountdownRunning({ ...live, timerRemainingMs: 0 })).toBe(false);
    expect(isHeaderCountdownRunning({ ...live, timerRemainingMs: null })).toBe(false);
    expect(isHeaderCountdownRunning({ ...live, isMyTurn: false })).toBe(false);
    expect(isHeaderCountdownRunning({ ...live, isTimerDraft: false })).toBe(false);
    expect(isHeaderCountdownRunning({ ...live, draftStatus: "PAUSED" })).toBe(false);
    expect(isHeaderCountdownRunning({ ...live, isFinalResults: true })).toBe(false);
  });
});
