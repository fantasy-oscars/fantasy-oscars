import { describe, expect, it } from "vitest";
import {
  clampWindowStart,
  rosterAnnouncement,
  rosterGeometry,
  stepWindow,
  windowForSeat
} from "@/decisions/draft/rosterWindow";

describe("rosterGeometry", () => {
  it("fits one 310 px column on a 390 px phone with 28 px peeks", () => {
    const g = rosterGeometry(390, "phone");
    expect(g.capacity).toBe(1);
    expect(g.side).toBe(40);
    expect(g.columnWidth).toBe(310);
  });

  it.each([
    [500, 2],
    [768, 3],
    [1100, 5],
    [1280, 6],
    [2400, 6],
    [200, 1]
  ])("sizes the desktop window at %i px to %i seats", (width, capacity) => {
    expect(rosterGeometry(width, "desktop").capacity).toBe(capacity);
  });

  it("keeps desktop columns at least 176 px wide", () => {
    for (let width = 300; width <= 2000; width += 7) {
      const g = rosterGeometry(width, "desktop");
      if (width >= 2 * g.side + 176) expect(g.columnWidth).toBeGreaterThanOrEqual(176);
    }
  });

  it("gives six 183 px columns at 1280", () => {
    const g = rosterGeometry(1280, "desktop");
    expect(Math.round(g.columnWidth)).toBe(183);
    expect(g.side).toBe(60);
    expect(g.step).toBeCloseTo(g.columnWidth + 12);
  });

  it("never returns a negative width", () => {
    expect(rosterGeometry(0, "desktop").columnWidth).toBe(0);
  });
});

describe.each([2, 7, 12, 200])("window stepping with %i seats", (count) => {
  const capacity = Math.min(6, count);
  const last = count - capacity;

  it("steps one seat and stops at both ends", () => {
    expect(stepWindow(0, -1, capacity, count)).toBe(0);
    expect(stepWindow(0, 1, capacity, count)).toBe(Math.min(1, last));
    expect(stepWindow(last, 1, capacity, count)).toBe(last);
    expect(stepWindow(last, -1, capacity, count)).toBe(Math.max(0, last - 1));
  });

  it("clamps a seat to a full window", () => {
    expect(windowForSeat(0, capacity, count)).toBe(0);
    expect(windowForSeat(count - 1, capacity, count)).toBe(last);
    expect(windowForSeat(Math.floor(count / 2), capacity, count)).toBe(
      Math.min(Math.floor(count / 2), last)
    );
  });
});

describe("window edge cases", () => {
  it("steps 1-6 of 8 to 2-7", () => {
    expect(stepWindow(0, 1, 6, 8)).toBe(1);
  });

  it("does not move when seats fit the window", () => {
    expect(stepWindow(0, 1, 6, 4)).toBe(0);
    expect(windowForSeat(3, 6, 4)).toBe(0);
  });

  it("clamps a stale start after the window grows", () => {
    expect(clampWindowStart(9, 6, 12)).toBe(6);
    expect(clampWindowStart(-3, 6, 12)).toBe(0);
  });
});

describe("rosterAnnouncement", () => {
  it("describes the desktop window", () => {
    expect(rosterAnnouncement(6, 6, 14, "desktop")).toBe("Seats 7 to 12 of 14");
  });

  it("describes the phone seat", () => {
    expect(rosterAnnouncement(1, 1, 6, "phone")).toBe("Seat 2 of 6");
  });

  it("names a single seat when the window holds one", () => {
    expect(rosterAnnouncement(2, 1, 9, "desktop")).toBe("Seat 3 of 9");
  });
});
