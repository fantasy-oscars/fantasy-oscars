import { describe, expect, it } from "vitest";
import {
  AUTH_SESSION_RENEW_AFTER_MS,
  AUTH_SESSION_TTL_MS,
  secondsUntil,
  shouldRenewAuthSession
} from "../../../src/domain/authSession.js";

describe("auth session policy", () => {
  const now = new Date("2026-10-28T12:00:00Z");

  it("uses a 30-day lifetime renewed at most daily", () => {
    expect(AUTH_SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(AUTH_SESSION_RENEW_AFTER_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("renews only once the last renewal is more than 24 h old", () => {
    const at = (msAgo: number) => new Date(now.getTime() - msAgo);
    expect(shouldRenewAuthSession(at(60_000), now)).toBe(false);
    expect(shouldRenewAuthSession(at(AUTH_SESSION_RENEW_AFTER_MS), now)).toBe(false);
    expect(shouldRenewAuthSession(at(AUTH_SESSION_RENEW_AFTER_MS + 1), now)).toBe(true);
  });

  it("computes whole seconds until expiry, never below one", () => {
    expect(secondsUntil(new Date(now.getTime() + 90_500), now)).toBe(90);
    expect(secondsUntil(new Date(now.getTime() - 5_000), now)).toBe(1);
  });
});
