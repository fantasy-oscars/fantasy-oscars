import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "../../../src/utils/rateLimiter.js";

describe("SlidingWindowRateLimiter", () => {
  it("rejects when max exceeded within window", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 2 });
    expect(limiter.allow("k", 0)).toBe(true);
    expect(limiter.allow("k", 100)).toBe(true);
    expect(limiter.allow("k", 200)).toBe(false);
  });

  it("allows after window elapses", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.allow("k", 0)).toBe(true);
    expect(limiter.allow("k", 500)).toBe(false);
    expect(limiter.allow("k", 1200)).toBe(true);
  });
});
