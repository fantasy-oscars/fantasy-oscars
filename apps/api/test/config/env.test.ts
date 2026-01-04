import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/config/env.js";

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
    withEnv({ PORT: "4000" }, () => {
      const cfg = loadConfig();
      expect(cfg.port).toBe(4000);
    });
  });

  it("throws when required vars are missing", () => {
    withEnv({ PORT: "" }, () => {
      expect(() => loadConfig()).toThrow(ConfigError);
    });
  });

  it("validates port as positive integer", () => {
    withEnv({ PORT: "not-a-number" }, () => {
      expect(() => loadConfig()).toThrow(ConfigError);
    });
    withEnv({ PORT: "-1" }, () => {
      expect(() => loadConfig()).toThrow(ConfigError);
    });
  });
});
