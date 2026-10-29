import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../../src/config/env.js";

function withEnv(env: Record<string, string>, fn: () => void) {
  const prev = { ...process.env };
  process.env = { ...process.env, ...env };
  try {
    fn();
  } finally {
    process.env = prev;
  }
}

describe("loadConfig", () => {
  it("loads required values when present", () => {
    withEnv({ PORT: "4000", AUTH_SECRET: "secret" }, () => {
      const cfg = loadConfig();
      expect(cfg.port).toBe(4000);
      expect(cfg.authSecret).toBe("secret");
      expect(cfg.realtimeEnabled).toBe(true);
    });
  });

  it("throws when required vars are missing", () => {
    withEnv({ PORT: "", AUTH_SECRET: "secret" }, () => {
      expect(() => loadConfig()).toThrow(ConfigError);
    });
    withEnv({ PORT: "4000", AUTH_SECRET: "" }, () => {
      expect(() => loadConfig()).toThrow(ConfigError);
    });
  });

  it("validates port as positive integer", () => {
    withEnv({ PORT: "not-a-number", AUTH_SECRET: "secret" }, () => {
      expect(() => loadConfig()).toThrow(ConfigError);
    });
    withEnv({ PORT: "-1", AUTH_SECRET: "secret" }, () => {
      expect(() => loadConfig()).toThrow(ConfigError);
    });
  });

  it("parses REALTIME_ENABLED when provided", () => {
    withEnv({ PORT: "4000", AUTH_SECRET: "secret", REALTIME_ENABLED: "false" }, () => {
      expect(loadConfig().realtimeEnabled).toBe(false);
    });
    withEnv({ PORT: "4000", AUTH_SECRET: "secret", REALTIME_ENABLED: "true" }, () => {
      expect(loadConfig().realtimeEnabled).toBe(true);
    });
  });
});

describe("TRUST_PROXY and CORS config", () => {
  const base = { PORT: "4000", AUTH_SECRET: "secret" };

  it("parses integer, boolean and empty TRUST_PROXY", () => {
    expect(loadConfig({ ...base, TRUST_PROXY: "2" }).trustProxy).toBe(2);
    expect(loadConfig({ ...base, TRUST_PROXY: "0" }).trustProxy).toBe(0);
    expect(loadConfig({ ...base, TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(
      loadConfig({ ...base, NODE_ENV: "production", TRUST_PROXY: "false" }).trustProxy
    ).toBe(false);
    expect(loadConfig({ ...base, TRUST_PROXY: "" }).trustProxy).toBe(false);
  });

  it("defaults TRUST_PROXY to 1 in production and false otherwise", () => {
    expect(loadConfig({ ...base, NODE_ENV: "production" }).trustProxy).toBe(1);
    expect(loadConfig({ ...base, NODE_ENV: "development" }).trustProxy).toBe(false);
    expect(loadConfig(base).trustProxy).toBe(false);
  });

  it("rejects invalid TRUST_PROXY values", () => {
    for (const bad of ["-1", "1.5", "yes", "abc"]) {
      expect(() => loadConfig({ ...base, TRUST_PROXY: bad })).toThrow(ConfigError);
    }
  });

  it("parses the CORS allowlist, normalising trailing slashes", () => {
    expect(
      loadConfig({
        ...base,
        CORS_ALLOWED_ORIGINS: "https://a.example/, https://b.example ,,"
      }).corsAllowedOrigins
    ).toEqual(["https://a.example", "https://b.example"]);
    expect(loadConfig(base).corsAllowedOrigins).toEqual([
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ]);
  });
});
