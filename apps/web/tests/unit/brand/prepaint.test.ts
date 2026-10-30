// @vitest-environment node
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BRAND_IDS,
  BRAND_PREFERENCES,
  brandDayNumber,
  localDateTimeFromDate,
  resolveBrand
} from "@fantasy-oscars/shared/brands";
import { buildBrandInitScript } from "../../../vite/brandInit";

class MemoryStorage {
  private data = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.data.set(k, v);
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

type Stored = { local?: Record<string, string>; session?: Record<string, string> };

/** Runs the built script in an isolated context with a fixed clock; returns data-brand. */
function runScript(code: string, now: Date, stored: Stored): string | undefined {
  const dataset: Record<string, string> = {};
  class FixedDate extends Date {
    constructor(...args: [] | [number | string | Date]) {
      if (args.length === 0) super(now.getTime());
      else super(args[0] as number);
    }
  }
  const sandbox: Record<string, unknown> = {
    document: { documentElement: { dataset } },
    localStorage: new MemoryStorage(stored.local),
    sessionStorage: new MemoryStorage(stored.session),
    Date: FixedDate
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return dataset.brand;
}

const ANON = "anon-test-id";
const LOCAL = { "fo:anon-id": ANON };

function expected(preference: unknown, now: Date): string {
  return resolveBrand({
    preference,
    now: localDateTimeFromDate(now),
    identity: `anon:${ANON}`
  });
}

describe("pre-paint brand script", () => {
  let code = "";
  beforeAll(async () => {
    code = await buildBrandInitScript();
  });

  it("is small and self-contained", () => {
    expect(code.length).toBeLessThan(6000);
    expect(code).not.toContain("import ");
    expect(code).not.toContain("zod");
  });

  it("matches the shared resolver for every preference across two weeks", () => {
    const preferences: unknown[] = [null, "garbage", ...BRAND_PREFERENCES];
    for (let day = 0; day < 14; day += 1) {
      for (const hour of [3, 4, 15]) {
        const now = new Date(2035, 1, 10 + day, hour, 30);
        for (const preference of preferences) {
          const local: Record<string, string> = { ...LOCAL };
          if (typeof preference === "string") local["fo:brand-preference"] = preference;
          const brand = runScript(code, now, { local });
          expect(brand, `${String(preference)} @ ${now.toISOString()}`).toBe(
            expected(preference, now)
          );
        }
      }
    }
  });

  it("reuses this tab's pin on the same brand day", () => {
    const now = new Date(2035, 1, 10, 12, 0);
    const day = brandDayNumber(localDateTimeFromDate(now));
    const pinned = BRAND_IDS[3];
    const session = {
      "fo:brand-session": JSON.stringify({ brand: pinned, day, key: "user:1|rotate" })
    };
    expect(runScript(code, now, { local: LOCAL, session })).toBe(pinned);
  });

  it("ignores a pin from an earlier brand day", () => {
    const now = new Date(2035, 1, 10, 12, 0);
    const day = brandDayNumber(localDateTimeFromDate(now));
    const session = {
      "fo:brand-session": JSON.stringify({ brand: BRAND_IDS[3], day: day - 1, key: "k" })
    };
    expect(runScript(code, now, { local: LOCAL, session })).toBe(expected(null, now));
  });

  it("uses the cached last brand of a signed-in user only for the same day", () => {
    const now = new Date(2035, 1, 10, 12, 0);
    const day = brandDayNumber(localDateTimeFromDate(now));
    const cache = (d: number) => ({
      ...LOCAL,
      "fo:brand-last": JSON.stringify({ brand: BRAND_IDS[5], day: d })
    });
    expect(runScript(code, now, { local: cache(day) })).toBe(BRAND_IDS[5]);
    expect(runScript(code, now, { local: cache(day - 1) })).toBe(expected(null, now));
  });

  it("falls back to the default resolution on malformed storage", () => {
    const now = new Date(2035, 1, 10, 12, 0);
    const local = { ...LOCAL, "fo:brand-last": "{not json" };
    const session = { "fo:brand-session": "[]" };
    expect(runScript(code, now, { local, session })).toBe(expected(null, now));
  });
});
