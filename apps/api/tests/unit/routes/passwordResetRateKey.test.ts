import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { passwordResetEmailRateKey } from "../../../src/routes/auth/passwordResetRateKey.js";

const req = (email: unknown, ip = "203.0.113.1") =>
  ({ ip, body: { email } }) as unknown as Request;

describe("passwordResetEmailRateKey", () => {
  it("buckets by normalised address across IPs and never contains the address", () => {
    const key = passwordResetEmailRateKey(req(" Player@Example.com "));
    expect(key).toBe(
      passwordResetEmailRateKey(req("player@example.com", "198.51.100.7"))
    );
    expect(key).not.toContain("player");
    expect(key).not.toBe(passwordResetEmailRateKey(req("other@example.com")));
  });

  it("has a fixed length for very long input", () => {
    expect(passwordResetEmailRateKey(req("a".repeat(100_000))).length).toBe(
      passwordResetEmailRateKey(req("a@b.co")).length
    );
  });
});
