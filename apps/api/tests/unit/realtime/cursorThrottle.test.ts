import { describe, expect, it } from "vitest";
import { createCursorThrottle } from "../../../src/realtime/cursorThrottle.js";

describe("createCursorThrottle", () => {
  it("allows at most 20 events in a burst within one second", () => {
    let t = 1_000_000;
    const allow = createCursorThrottle(20, () => t);
    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      t += 5; // 100 events over 500ms
      if (allow()) allowed += 1;
    }
    expect(allowed).toBe(20);
  });

  it("allows again once the window has passed", () => {
    let t = 1_000_000;
    const allow = createCursorThrottle(2, () => t);
    expect([allow(), allow(), allow()]).toEqual([true, true, false]);
    t += 1000;
    expect(allow()).toBe(true);
  });

  it("tracks each throttle independently", () => {
    const a = createCursorThrottle(1, () => 5000);
    const b = createCursorThrottle(1, () => 5000);
    expect(a()).toBe(true);
    expect(a()).toBe(false);
    expect(b()).toBe(true);
  });
});
