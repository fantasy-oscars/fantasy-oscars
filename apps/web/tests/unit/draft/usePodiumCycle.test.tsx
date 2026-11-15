import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PODIUM_CYCLE_INTERVAL_MS,
  usePodiumCycle
} from "@/orchestration/draft/usePodiumCycle";
import type { PodiumCell } from "@/decisions/draft/podium";

const tied: PodiumCell[] = [{ place: 1, names: ["a", "b", "c"] }];
const other: PodiumCell[] = [{ place: 1, names: ["x", "y"] }];
const untied: PodiumCell[] = [{ place: 1, names: ["a"] }];

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

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("usePodiumCycle", () => {
  it("steps once every 1500 ms while a place is tied", () => {
    const { result } = renderHook(() => usePodiumCycle(tied));
    expect(result.current).toEqual({ tick: 0, animate: true });
    act(() => {
      vi.advanceTimersByTime(PODIUM_CYCLE_INTERVAL_MS);
    });
    expect(result.current.tick).toBe(1);
    act(() => {
      vi.advanceTimersByTime(PODIUM_CYCLE_INTERVAL_MS * 2);
    });
    expect(result.current.tick).toBe(3);
  });

  it("never steps, and never animates, without a tie", () => {
    const { result } = renderHook(() => usePodiumCycle(untied));
    act(() => {
      vi.advanceTimersByTime(PODIUM_CYCLE_INTERVAL_MS * 4);
    });
    expect(result.current).toEqual({ tick: 0, animate: false });
  });

  it("restarts from zero when the podium changes", () => {
    const { result, rerender } = renderHook(
      (podium: PodiumCell[]) => usePodiumCycle(podium),
      { initialProps: tied }
    );
    act(() => {
      vi.advanceTimersByTime(PODIUM_CYCLE_INTERVAL_MS * 2);
    });
    expect(result.current.tick).toBe(2);
    rerender(other);
    expect(result.current.tick).toBe(0);
    act(() => {
      vi.advanceTimersByTime(PODIUM_CYCLE_INTERVAL_MS);
    });
    expect(result.current.tick).toBe(1);
  });

  it("still swaps names under reduced motion, with no roll", () => {
    stubReducedMotion(true);
    const { result } = renderHook(() => usePodiumCycle(tied));
    expect(result.current.animate).toBe(false);
    act(() => {
      vi.advanceTimersByTime(PODIUM_CYCLE_INTERVAL_MS);
    });
    expect(result.current).toEqual({ tick: 1, animate: false });
  });
});
