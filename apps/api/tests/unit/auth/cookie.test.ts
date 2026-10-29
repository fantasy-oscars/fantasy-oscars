import { describe, expect, it } from "vitest";
import { authCookieConfig } from "../../../src/auth/cookie.js";
import { ConfigError, loadConfig } from "../../../src/config/env.js";

describe("authCookieConfig SameSite", () => {
  it("defaults to none+secure in production and lax otherwise", () => {
    const prod = authCookieConfig({ NODE_ENV: "production" });
    expect(prod.sameSite).toBe("none");
    expect(prod.secure).toBe(true);
    const dev = authCookieConfig({ NODE_ENV: "development" });
    expect(dev.sameSite).toBe("lax");
    expect(dev.secure).toBe(false);
  });

  it("honours AUTH_COOKIE_SAMESITE", () => {
    const prod = { NODE_ENV: "production" };
    expect(authCookieConfig({ ...prod, AUTH_COOKIE_SAMESITE: "lax" }).sameSite).toBe(
      "lax"
    );
    expect(authCookieConfig({ ...prod, AUTH_COOKIE_SAMESITE: "Strict" }).sameSite).toBe(
      "strict"
    );
    expect(authCookieConfig({ ...prod, AUTH_COOKIE_SAMESITE: "none" }).sameSite).toBe(
      "none"
    );
    expect(authCookieConfig({ AUTH_COOKIE_SAMESITE: "strict" }).sameSite).toBe("strict");
  });

  it("treats an empty value as unset", () => {
    expect(authCookieConfig({ AUTH_COOKIE_SAMESITE: " " }).sameSite).toBe("lax");
  });

  it("rejects unknown values", () => {
    expect(() => authCookieConfig({ AUTH_COOKIE_SAMESITE: "relaxed" })).toThrow(
      /AUTH_COOKIE_SAMESITE must be one of lax, strict, none/
    );
  });

  it("rejects none when the cookie would not be Secure", () => {
    expect(() => authCookieConfig({ AUTH_COOKIE_SAMESITE: "none" })).toThrow(ConfigError);
  });

  it("fails config loading on an invalid value", () => {
    const base = { PORT: "4000", AUTH_SECRET: "s" };
    expect(() => loadConfig({ ...base, AUTH_COOKIE_SAMESITE: "bogus" })).toThrow(
      ConfigError
    );
    expect(() => loadConfig({ ...base, AUTH_COOKIE_SAMESITE: "lax" })).not.toThrow();
  });
});
