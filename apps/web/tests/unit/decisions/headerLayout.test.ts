import { describe, expect, it } from "vitest";
import { shouldCompactHeader } from "@/decisions/draft/headerLayout";

// Header 1280 wide, 14 px padding each side, 410 px tab: each wing owns 421 px.
// The limit is 421 less the hysteresis (10 entering compact, 22 leaving it).
const roomy = { headerWidth: 1280, tabWidth: 410, wasCompact: false } as const;

describe("shouldCompactHeader", () => {
  it("keeps full wings that fit", () => {
    expect(shouldCompactHeader({ ...roomy, leftNeeded: 300, rightNeeded: 400 })).toBe(
      false
    );
  });

  it("compacts when either wing needs more than its half", () => {
    expect(shouldCompactHeader({ ...roomy, leftNeeded: 412, rightNeeded: 100 })).toBe(
      true
    );
    expect(shouldCompactHeader({ ...roomy, leftNeeded: 100, rightNeeded: 412 })).toBe(
      true
    );
  });

  it("enters compact at the 10 px headroom and leaves it at 22 px", () => {
    const wings = { leftNeeded: 400, rightNeeded: 100 };
    expect(shouldCompactHeader({ ...roomy, ...wings, leftNeeded: 412 })).toBe(true);
    expect(shouldCompactHeader({ ...roomy, ...wings, leftNeeded: 411 })).toBe(false);
    // Already compact: the same 400 px wing is not enough headroom to expand.
    expect(shouldCompactHeader({ ...roomy, ...wings, wasCompact: true })).toBe(true);
    expect(
      shouldCompactHeader({ ...roomy, ...wings, leftNeeded: 399, wasCompact: true })
    ).toBe(false);
  });

  it("a wider wing measurement after a font swap flips a fitting header to compact", () => {
    const before = { ...roomy, leftNeeded: 380, rightNeeded: 380 };
    expect(shouldCompactHeader(before)).toBe(false);
    expect(shouldCompactHeader({ ...before, leftNeeded: 440, rightNeeded: 440 })).toBe(
      true
    );
  });

  it("a narrower wing measurement after a theme swap lets a compact header expand", () => {
    const compact = { ...roomy, wasCompact: true, leftNeeded: 440, rightNeeded: 440 };
    expect(shouldCompactHeader(compact)).toBe(true);
    expect(shouldCompactHeader({ ...compact, leftNeeded: 360, rightNeeded: 360 })).toBe(
      false
    );
  });

  it("compacts at any width when the tab leaves no room", () => {
    expect(
      shouldCompactHeader({
        headerWidth: 500,
        tabWidth: 496,
        leftNeeded: 40,
        rightNeeded: 40,
        wasCompact: false
      })
    ).toBe(true);
  });
});
