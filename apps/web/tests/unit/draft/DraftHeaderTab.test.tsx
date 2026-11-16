import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import { computeHeaderStatus } from "@/decisions/draft/headerStatus";
import type { PodiumCell } from "@/decisions/draft/podium";
import { DraftHeaderTab } from "@/features/draft/ui/DraftHeaderTab";

afterEach(cleanup);

const base = {
  draftStatus: "IN_PROGRESS",
  isFinalResults: false,
  hasPodium: false,
  isTimerDraft: true,
  isMyTurn: false,
  countdownActive: false,
  countdownPhase: null,
  timerRemainingMs: null,
  clockText: "1:30",
  activeLabel: "Blake"
} as const;

function renderTab(
  args: Partial<Parameters<typeof computeHeaderStatus>[0]>,
  round: number | null = 2,
  pick: number | null = 5,
  podium: PodiumCell[] = []
) {
  return render(
    <MantineProvider>
      <DraftHeaderTab
        status={computeHeaderStatus({ ...base, ...args })}
        roundNumber={round}
        pickNumber={pick}
        podium={podium}
      />
    </MantineProvider>
  );
}

describe("DraftHeaderTab", () => {
  it("is a labelled group, not a live region, with no focusable content", () => {
    const { container } = renderTab({});
    const tab = screen.getByRole("group", { name: "Draft status" });
    expect(tab.classList.contains("drh-tab")).toBe(true);
    expect(tab.getAttribute("aria-live")).toBeNull();
    expect(tab.getAttribute("tabindex")).toBeNull();
    expect(container.querySelector("button, a, [tabindex]")).toBeNull();
  });

  it("renders every headline kind as a bare span, so the kind's size and weight apply", () => {
    for (const args of [
      { isTimerDraft: false },
      { draftStatus: "PAUSED" },
      { draftStatus: "PENDING" }
    ]) {
      const { container } = renderTab(args);
      const text = container.querySelector(".drh-tabHeadline > .drh-tabHeadlineText");
      expect(text?.tagName).toBe("SPAN");
      expect(text?.className).toBe("drh-tabHeadlineText");
      cleanup();
    }
  });

  it("shows the seat name over a digit-celled clock, round and pick", () => {
    const { container } = renderTab({});
    expect(screen.getByText("Blake")).toBeTruthy();
    expect(container.querySelectorAll(".drh-tabHeadline .dr-digit").length).toBe(3);
    expect(container.querySelector(".drh-tabHeadline")?.getAttribute("title")).toBe(
      "1:30"
    );
    expect(screen.getByText("Round").nextSibling?.textContent).toBe("2");
    expect(screen.getByText("Pick").nextSibling?.textContent).toBe("5");
  });

  it("shows dashes before the draft starts", () => {
    renderTab({ draftStatus: "PENDING" });
    expect(screen.getByText("Not started")).toBeTruthy();
    expect(screen.getByText("Round").nextSibling?.textContent).toBe("—");
    expect(screen.getByText("Pick").nextSibling?.textContent).toBe("—");
  });

  it("carries the countdown tone, timer glyph and words", () => {
    const { container } = renderTab({
      isMyTurn: true,
      countdownActive: true,
      countdownPhase: "gold",
      timerRemainingMs: 3000
    });
    const tab = container.querySelector(".drh-tab");
    expect(tab?.getAttribute("data-tone")).toBe("countdown-primary");
    expect(container.querySelector(".drh-tabGlyph")?.textContent).toBe("timer");
    expect(container.querySelector(".drh-tabHeadlineText")?.textContent).toBe("3s left");
    expect(screen.getByText("Your pick")).toBeTruthy();
  });

  it("drops the stat cells when the draft is complete", () => {
    const { container } = renderTab({ draftStatus: "COMPLETED" });
    expect(container.querySelector(".drh-tabStat")).toBeNull();
    expect(container.querySelector(".drh-tab")?.getAttribute("data-stats")).toBe("off");
    expect(screen.getByText("Draft complete")).toBeTruthy();
  });
});

describe("DraftHeaderTab podium", () => {
  const final = { draftStatus: "COMPLETED", isFinalResults: true, hasPodium: true };
  const three: PodiumCell[] = [
    { place: 1, names: ["Ann"] },
    { place: 2, names: ["Bo", "Cy"] },
    { place: 3, names: ["Di"] }
  ];

  function cells(container: HTMLElement) {
    return Array.from(container.querySelectorAll(".drh-tabPlace"));
  }

  it("renders flush cells in DOM order 1st, 2nd, 3rd with no stat cells", () => {
    const { container } = renderTab(final, 1, 1, three);
    const tab = container.querySelector(".drh-tab");
    expect(tab?.getAttribute("data-tone")).toBe("final");
    expect(tab?.getAttribute("data-podium")).toBe("3");
    expect(container.querySelector(".drh-tabStat, .drh-tabCenter")).toBeNull();
    expect(cells(container).map((c) => c.getAttribute("data-place"))).toEqual([
      "1",
      "2",
      "3"
    ]);
  });

  it("names every place and marks ties in the kicker and the cell label", () => {
    const { container } = renderTab(final, 1, 1, three);
    expect(
      cells(container).map((c) => c.querySelector(".drh-tabKicker")?.textContent)
    ).toEqual(["Winner", "Tied 2nd", "3rd"]);
    expect(screen.getByRole("group", { name: "First place: Ann" })).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Second place: Bo, Cy (tied)" })
    ).toBeTruthy();
    expect(screen.getByRole("group", { name: "Third place: Di" })).toBeTruthy();
  });

  it("hides the cycling name from assistive tech and titles it", () => {
    const { container } = renderTab(final, 1, 1, three);
    const name = cells(container)[1]?.querySelector(".drh-tabPlaceName");
    expect(name?.getAttribute("aria-hidden")).toBe("true");
    expect(name?.getAttribute("title")).toBe("Bo");
  });

  it("cycles tied names every 1500 ms", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderTab(final, 1, 1, three);
      const second = () => cells(container)[1]?.querySelector(".drh-tabPlaceName");
      expect(second()?.textContent).toBe("Bo");
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(second()?.textContent).toBe("Cy");
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(second()?.textContent).toBe("Bo");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sizes the grid to the places that exist", () => {
    const two = renderTab(final, 1, 1, three.slice(0, 2));
    expect(two.container.querySelector(".drh-tab")?.getAttribute("data-podium")).toBe(
      "2"
    );
    cleanup();
    const one = renderTab(final, 1, 1, three.slice(0, 1));
    expect(one.container.querySelector(".drh-tab")?.getAttribute("data-podium")).toBe(
      "1"
    );
  });

  it("falls back to Draft complete in the rest tone with no podium", () => {
    const { container } = renderTab({ ...final, hasPodium: false }, 1, 1, []);
    expect(container.querySelector(".drh-tab")?.getAttribute("data-tone")).toBe("rest");
    expect(container.querySelector(".drh-tabPlace")).toBeNull();
    expect(screen.getByText("Draft complete")).toBeTruthy();
  });
});
