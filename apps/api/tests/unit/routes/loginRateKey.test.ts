import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { loginUserRateKey } from "../../../src/routes/auth/loginRateKey.js";

const req = (username: unknown, ip = "203.0.113.1") =>
  ({ ip, body: { username } }) as unknown as Request;

describe("loginUserRateKey", () => {
  it("produces a fixed-length key for very long usernames", () => {
    const short = loginUserRateKey(req("alice"));
    const long = loginUserRateKey(req("a".repeat(100_000)));
    expect(long.length).toBe(short.length);
  });

  it("buckets case-insensitively and separates IPs", () => {
    expect(loginUserRateKey(req("Alice"))).toBe(loginUserRateKey(req("alice")));
    expect(loginUserRateKey(req("alice"))).not.toBe(
      loginUserRateKey(req("alice", "203.0.113.2"))
    );
  });
});
