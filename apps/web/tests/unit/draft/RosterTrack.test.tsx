import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@ui";
import type { RosterLayout } from "@/decisions/draft/rosterWindow";
import { RosterTrack } from "@/features/draft/ui/RosterTrack";
import { useRosterRotation } from "@/orchestration/draft/useRosterRotation";

let boardWidth = 1280;

beforeEach(() => {
  boardWidth = 1280;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const width = this.classList.contains("dr-rosterBoard") ? boardWidth : 0;
    return {
      width,
      height: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 0,
      x: 0,
      y: 0
    } as DOMRect;
  });
  stubReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      }) as unknown as MediaQueryList
  );
}

function Harness(props: { count: number; layout?: RosterLayout; focusable?: boolean }) {
  const rotation = useRosterRotation({
    count: props.count,
    layout: props.layout ?? "desktop"
  });
  return (
    <MantineProvider>
      <RosterTrack
        rotation={rotation}
        columnKey={(i) => i}
        renderColumn={(i) => (
          <div>
            seat {i + 1}
            {props.focusable ? <button type="button">pick {i + 1}</button> : null}
          </div>
        )}
        controlsMiddle={props.layout === "phone" ? <span>middle</span> : undefined}
      />
    </MantineProvider>
  );
}

const track = () => document.querySelector("[data-roster-track]") as HTMLElement;
const board = () => screen.getByRole("region", { name: "Roster board" });
const next = () => screen.getByRole("button", { name: "Next seat" });
const prev = () => screen.getByRole("button", { name: "Previous seat" });
const states = () =>
  Array.from(track().children).map(
    (c) => `${c.textContent}:${c.getAttribute("data-state")}`
  );

describe("RosterTrack", () => {
  it("renders the track and no controls when seats fit the window", () => {
    render(<Harness count={4} />);
    expect(track()).not.toBeNull();
    expect(track().hasAttribute("data-fits")).toBe(true);
    expect(screen.queryByRole("button", { name: "Next seat" })).toBeNull();
    expect(screen.getByText("Seats 1 to 4 of 4")).toBeTruthy();
    expect(
      Array.from(track().children).every((c) => c.getAttribute("data-state") === "window")
    ).toBe(true);
  });

  it("renders the window and one peek, and only a few columns for 200 seats", () => {
    render(<Harness count={200} />);
    expect(track().children.length).toBeLessThanOrEqual(10);
    const s = states();
    expect(s.slice(0, 6).every((x) => x.endsWith(":window"))).toBe(true);
    expect(s[6]).toBe("seat 7:peek");
    expect(s.some((x) => x.startsWith("seat 1:") && x.endsWith(":peek"))).toBe(false);
  });

  it("steps one seat with the buttons and announces the window", () => {
    render(<Harness count={14} />);
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
    fireEvent.click(next());
    expect(screen.getByText("Seats 2 to 7 of 14")).toBeTruthy();
    fireEvent.click(prev());
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
  });

  it("keeps the end buttons focusable but inert", () => {
    render(<Harness count={8} />);
    expect(prev().getAttribute("aria-disabled")).toBe("true");
    expect(prev().hasAttribute("disabled")).toBe(false);
    fireEvent.click(prev());
    expect(screen.getByText("Seats 1 to 6 of 8")).toBeTruthy();
    fireEvent.click(next());
    fireEvent.click(next());
    expect(screen.getByText("Seats 3 to 8 of 8")).toBeTruthy();
    expect(next().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(next());
    expect(screen.getByText("Seats 3 to 8 of 8")).toBeTruthy();
    act(() => next().focus());
    expect(document.activeElement).toBe(next());
  });

  it("steps with the arrow keys and jumps with Home and End", () => {
    render(<Harness count={14} />);
    act(() => board().focus());
    fireEvent.keyDown(board(), { key: "ArrowRight" });
    expect(screen.getByText("Seats 2 to 7 of 14")).toBeTruthy();
    fireEvent.keyDown(board(), { key: "ArrowLeft" });
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
    fireEvent.keyDown(board(), { key: "End" });
    expect(screen.getByText("Seats 9 to 14 of 14")).toBeTruthy();
    fireEvent.keyDown(board(), { key: "Home" });
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
  });

  it("ignores arrow keys typed into an input", () => {
    render(
      <MantineProvider>
        <HarnessWithInput />
      </MantineProvider>
    );
    fireEvent.keyDown(screen.getByLabelText("filter"), { key: "ArrowRight" });
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
  });

  it("steps one seat on a drag over 40 px and ignores a short one", () => {
    render(<Harness count={14} />);
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 300, button: 0 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 270 });
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 300, button: 0 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 240 });
    expect(screen.getByText("Seats 2 to 7 of 14")).toBeTruthy();
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 100, button: 0 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 180 });
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
  });

  it("steps back on a drag right straight after a drag left, with a stale selection", () => {
    render(<Harness count={14} />);
    const text = board().querySelector("div div div") as HTMLElement;
    const select = () => {
      const range = document.createRange();
      range.selectNodeContents(text);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    };
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 600, button: 0 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 200 });
    expect(screen.getByText("Seats 2 to 7 of 14")).toBeTruthy();
    // The previous gesture left a selection; the press clears it before the release.
    select();
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 200, button: 0 });
    window.getSelection()?.removeAllRanges();
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 600 });
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
  });

  it("does not step when the drag selected text", () => {
    render(<Harness count={14} />);
    const text = board().querySelector("div div div") as HTMLElement;
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 600, button: 0 });
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()?.addRange(range);
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 200 });
    window.getSelection()?.removeAllRanges();
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
  });

  it("follows a change of the reduced-motion setting", () => {
    let reduce = false;
    let notify: () => void = () => {};
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          get matches() {
            return reduce && query.includes("prefers-reduced-motion");
          },
          media: query,
          addEventListener: (_: string, cb: () => void) => {
            notify = cb;
          },
          removeEventListener: () => {},
          dispatchEvent: () => false
        }) as unknown as MediaQueryList
    );
    render(<Harness count={14} />);
    expect(track().hasAttribute("data-instant")).toBe(false);
    reduce = true;
    act(() => notify());
    expect(track().hasAttribute("data-instant")).toBe(true);
  });

  it("ignores a drag that starts on a button", () => {
    render(<Harness count={14} focusable />);
    const btn = screen.getByRole("button", { name: "pick 2" });
    fireEvent.pointerDown(btn, { pointerId: 1, clientX: 300, button: 0 });
    fireEvent.pointerUp(btn, { pointerId: 1, clientX: 100 });
    expect(screen.getByText("Seats 1 to 6 of 14")).toBeTruthy();
  });

  it("steps toward a clicked peek", () => {
    render(<Harness count={14} />);
    const peek = Array.from(track().children).find(
      (c) => c.getAttribute("data-state") === "peek"
    ) as HTMLElement;
    fireEvent.click(peek);
    expect(screen.getByText("Seats 2 to 7 of 14")).toBeTruthy();
  });

  it("slides instantly under reduced motion", () => {
    stubReducedMotion(true);
    render(<Harness count={14} />);
    expect(track().hasAttribute("data-instant")).toBe(true);
  });

  it("slides by default", () => {
    render(<Harness count={14} />);
    expect(track().hasAttribute("data-instant")).toBe(false);
  });

  it("moves focus to the board when a step removes the focused element", () => {
    render(<Harness count={14} focusable />);
    const btn = screen.getByRole("button", { name: "pick 1" });
    act(() => btn.focus());
    expect(document.activeElement).toBe(btn);
    fireEvent.keyDown(btn, { key: "End" });
    expect(document.activeElement).toBe(board());
  });

  it("shows one seat with a seat select slot between the buttons on the phone", () => {
    boardWidth = 390;
    render(<Harness count={6} layout="phone" />);
    expect(screen.getByText("Seat 1 of 6")).toBeTruthy();
    expect(screen.getByText("middle")).toBeTruthy();
    fireEvent.click(next());
    expect(screen.getByText("Seat 2 of 6")).toBeTruthy();
    expect(states().filter((x) => x.endsWith(":window"))).toEqual(["seat 2:window"]);
  });
});

function HarnessWithInput() {
  const rotation = useRosterRotation({ count: 14, layout: "desktop" });
  return (
    <RosterTrack
      rotation={rotation}
      columnKey={(i) => i}
      renderColumn={(i) => (i === 0 ? <input aria-label="filter" /> : <span>x</span>)}
    />
  );
}
