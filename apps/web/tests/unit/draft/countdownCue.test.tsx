import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { CenterBuckle } from "@/features/draft/ui/CenterBuckle";
import { DraftHeaderRightWing } from "@/features/draft/ui/DraftHeaderRightWing";
import {
  COUNTDOWN_BEEP_INTERVAL_MS,
  formatCountdownText
} from "@/decisions/draft/countdown";
import { buildDraftAnnouncement } from "@/decisions/draft/announcements";
import { useCountdownPhase } from "@/orchestration/draft/useCountdownPhase";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderBuckle(className: string, glyph: "timer" | "pause" | null, text: string) {
  return render(
    <MantineProvider>
      <CenterBuckle
        roundNumber={1}
        pickNumber={3}
        centerText={text}
        centerGlyph={glyph}
        className={className}
        measureText={null}
        isTimerDraft
        maxHandleLengthPx={140}
      />
    </MantineProvider>
  );
}

describe("countdown cue", () => {
  it("words are whole seconds rounded up, never below 1", () => {
    expect(formatCountdownText(4000)).toBe("4s left");
    expect(formatCountdownText(3001)).toBe("4s left");
    expect(formatCountdownText(1)).toBe("1s left");
    expect(formatCountdownText(0)).toBe("1s left");
  });

  it("shows the timer glyph and the words in the danger phase", () => {
    const { container } = renderBuckle("is-countdown pulse-red", "timer", "4s left");
    expect(screen.getByText("4s left")).toBeTruthy();
    const glyph = container.querySelector(".drh-buckleGlyph");
    expect(glyph?.textContent).toBe("timer");
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the glyph and the words in the gold phase", () => {
    const { container } = renderBuckle("is-countdown pulse-gold", "timer", "5s left");
    expect(screen.getByText("5s left")).toBeTruthy();
    expect(container.querySelector(".drh-buckleGlyph")?.textContent).toBe("timer");
  });

  it("shows the pause glyph beside Paused and no glyph otherwise", () => {
    const paused = renderBuckle("", "pause", "Paused");
    expect(paused.container.querySelector(".drh-buckleGlyph")?.textContent).toBe("pause");
    cleanup();
    const plain = renderBuckle("", null, "1:30");
    expect(plain.container.querySelector(".drh-buckleGlyph")).toBeNull();
  });

  it("starts the pulse in the danger phase and clears it when the window ends", () => {
    const { result, rerender } = renderHook(
      (active: boolean) =>
        useCountdownPhase({ active, canBeep: false, audioController: null }),
      { initialProps: true }
    );
    expect(result.current).toBe("red");
    rerender(false);
    expect(result.current).toBeNull();
  });

  it("holds the danger phase under reduced motion", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false
        }) as unknown as MediaQueryList
    );
    const { result } = renderHook(() =>
      useCountdownPhase({ active: true, canBeep: false, audioController: null })
    );
    expect(result.current).toBe("red");
    act(() => {
      vi.advanceTimersByTime(COUNTDOWN_BEEP_INTERVAL_MS * 3);
    });
    expect(result.current).toBe("red");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("announces the final seconds once, to the drafter on the clock only", () => {
    const base = {
      status: "IN_PROGRESS",
      latestPick: null,
      activeSeatLabel: "Alice"
    };
    expect(
      buildDraftAnnouncement({ ...base, isMyTurn: true, countdownActive: true })
    ).toBe("It is your turn to pick. 5 seconds left to pick.");
    expect(buildDraftAnnouncement({ ...base, isMyTurn: true })).toBe(
      "It is your turn to pick."
    );
    expect(
      buildDraftAnnouncement({ ...base, isMyTurn: false, countdownActive: true })
    ).toBe("Alice is picking.");
  });
});

describe("draft header toggles", () => {
  function renderWing(props: { soundEnabled: boolean; cursorSpyUserEnabled: boolean }) {
    return render(
      <MantineProvider>
        <DraftHeaderRightWing
          compactHeader={false}
          isCompleted={false}
          isPre={false}
          isPaused={false}
          view="draft"
          onViewChange={() => {}}
          canToggleView
          showDraftControls
          canManageDraft
          showDrafted={false}
          onToggleShowDrafted={() => {}}
          showDraftedVisible
          onToggleSound={() => {}}
          showCursorSpyToggle
          onToggleCursorSpy={() => {}}
          onStartDraft={() => {}}
          onPauseDraft={() => {}}
          onResumeDraft={() => {}}
          userLabel="Alice"
          userAvatarKey="gorilla"
          {...props}
        />
      </MantineProvider>
    );
  }

  it("keeps a stable name and reports state through aria-pressed", () => {
    renderWing({ soundEnabled: true, cursorSpyUserEnabled: false });
    expect(
      screen.getByRole("button", { name: "Draft sounds" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Cursor spy" }).getAttribute("aria-pressed")
    ).toBe("false");
    cleanup();
    renderWing({ soundEnabled: false, cursorSpyUserEnabled: true });
    expect(
      screen.getByRole("button", { name: "Draft sounds" }).getAttribute("aria-pressed")
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "Cursor spy" }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("gives the Show drafted switch its own accessible name", () => {
    renderWing({ soundEnabled: true, cursorSpyUserEnabled: true });
    expect(screen.getByRole("switch", { name: "Show drafted" })).toBeTruthy();
  });

  it("names the pause control by action and offers no mode control", () => {
    renderWing({ soundEnabled: true, cursorSpyUserEnabled: true });
    expect(screen.getByRole("button", { name: "Pause draft" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /mode/i })).toBeNull();
    expect(screen.getByText("Alice")).toBeTruthy();
  });
});
