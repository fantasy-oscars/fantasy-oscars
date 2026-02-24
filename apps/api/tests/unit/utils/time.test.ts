import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TEST_BASE_TIME,
  addSeconds,
  advanceSeconds,
  freezeTime,
  withFrozenTime
} from "../../support/time.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("time utilities", () => {
  it("adds seconds deterministically", () => {
    const later = addSeconds(TEST_BASE_TIME, 30);
    expect(later.toISOString()).toBe("2024-01-01T00:00:30.000Z");
  });

  it("freezes time and restores", () => {
    const restore = freezeTime(TEST_BASE_TIME);
    expect(new Date().toISOString()).toBe(TEST_BASE_TIME.toISOString());
    restore();
    expect(vi.getMockedSystemTime()).toBeNull();
  });

  it("advances frozen time by seconds", () => {
    const restore = freezeTime(TEST_BASE_TIME);
    const advanced = advanceSeconds(10);
    expect(advanced.toISOString()).toBe("2024-01-01T00:00:10.000Z");
    restore();
  });

  it("runs a function with frozen time and restores afterward", async () => {
    const result = await withFrozenTime(TEST_BASE_TIME, async () => {
      return new Date().toISOString();
    });
    expect(result).toBe(TEST_BASE_TIME.toISOString());
    expect(vi.getMockedSystemTime()).toBeNull();
  });
});
