// @vitest-environment node
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BRAND_CATALOG,
  BRAND_IDS,
  ENABLED_BRAND_IDS,
  STARTING_BRAND,
  brandDayNumber,
  localDateTimeFromDate,
  type BrandId
} from "@fantasy-oscars/shared/brands";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  parseAppearance,
  resolveAppearance,
  type DailyDraw
} from "@fantasy-oscars/shared/appearance";
import { preloadBrandFonts } from "../../../src/orchestration/brand/prepaint";
import { BRAND_DEFINITIONS, DEFAULT_BRAND } from "../../../src/theme/brands";
import { buildBrandInitScript, buildPreloadMap } from "../../../vite/brandInit";
import { preloadFace } from "../../../vite/fonts";

/** Hashed urls as the build emits them: `/assets/<face>-<8 char hash>.woff2`. */
function builtPreloadUrls(): Record<string, string[]> {
  const hashed = (ref: Parameters<typeof preloadFace>[0]) =>
    `/assets/${preloadFace(ref).file.replace(/\.woff2$/, "-AbCd1234.woff2")}`;
  const urls: Record<string, string[]> = {};
  for (const brand of BRAND_DEFINITIONS) {
    urls[brand.id] = [
      hashed(brand.fonts.preload.display),
      hashed(brand.fonts.preload.body)
    ];
  }
  urls["*"] = urls[DEFAULT_BRAND.id] ?? [];
  return urls;
}

/** The map of a real build, so the script is measured with its font data in. */
const BUILT_PRELOADS = buildPreloadMap(builtPreloadUrls());

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
  keys(): string[] {
    return [...this.data.keys()];
  }
}

type Painted = {
  brand: string | undefined;
  scheme: string | undefined;
  /** Storage keys present after the script ran. */
  keys: string[];
};

/** Runs the built script in an isolated context with a fixed clock. */
function runScript(code: string, now: Date, local: Record<string, string>): Painted {
  const dataset: Record<string, string> = {};
  const attributes: Record<string, string> = {};
  class FixedDate extends Date {
    constructor(...args: [] | [number | string | Date]) {
      if (args.length === 0) super(now.getTime());
      else super(args[0] as number);
    }
  }
  const storage = new MemoryStorage(local);
  const sandbox: Record<string, unknown> = {
    document: {
      documentElement: {
        dataset,
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        }
      }
    },
    localStorage: storage,
    sessionStorage: new MemoryStorage(),
    Date: FixedDate
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return {
    brand: dataset.brand,
    scheme: attributes["data-mantine-color-scheme"],
    keys: storage.keys()
  };
}

const ANON = "anon-test-id";
const ANON_ID = { "fo:anon-id": ANON };
const rounds = { ceremony: [], cinema: [] };
const NOW = new Date(2035, 1, 10, 12, 0);
const dayOf = (now: Date) => brandDayNumber(localDateTimeFromDate(now));

const draw = (day: number, brand: BrandId): DailyDraw => ({ day, brand, rounds });

function snapshot(over: {
  identity?: string;
  brandPreference?: string | null;
  appearance?: Record<string, unknown>;
}) {
  return JSON.stringify({
    identity: over.identity ?? "user:7",
    brandPreference: over.brandPreference ?? null,
    appearance: over.appearance ?? {}
  });
}

function primaryBase(brand: string): string {
  return BRAND_CATALOG.find((entry) => entry.id === brand)!.modes[0].base;
}

/** The app's own resolution, from the same stored values the script reads. */
function expected(
  now: Date,
  local: Record<string, string>
): { brand: string; scheme: string } {
  const day = dayOf(now);
  const raw = (key: string): unknown => {
    try {
      return JSON.parse(local[key] ?? "null");
    } catch {
      return null;
    }
  };
  const account = raw("fo:account-appearance") as {
    identity: string;
    brandPreference: string | null;
    appearance: Record<string, unknown>;
  } | null;
  const identity = account?.identity ?? `anon:${local["fo:anon-id"] ?? ANON}`;
  const parsed = account
    ? parseAppearance(
        { brand_preference: account.brandPreference, appearance: account.appearance },
        BRAND_IDS
      )
    : null;
  const anon = parseAppearance(
    { appearance: { daily_draw: raw("fo:anon-draw") } },
    BRAND_IDS
  );
  const queueRaw = raw("fo:discovered");
  const queue = Array.isArray(queueRaw) ? (queueRaw as BrandId[]) : [];
  const shuffle = raw("fo:shuffle") as (DailyDraw & { identity: string }) | null;
  const resolved = resolveAppearance({
    identity,
    day,
    enabled: BRAND_IDS,
    discovered: parsed ? parsed.discovered : queue,
    settings: parsed ? parsed.settings : DEFAULT_APPEARANCE_SETTINGS,
    record: parsed ? parsed.draw : anon.draw,
    shuffle:
      shuffle && shuffle.identity === identity && shuffle.day === day
        ? shuffle.brand
        : null
  });
  return { brand: resolved.brand, scheme: resolved.mode.base };
}

describe("pre-paint script (production build)", () => {
  let code = "";
  beforeAll(async () => {
    code = await buildBrandInitScript(BUILT_PRELOADS);
  });

  it("is small and self-contained, measured with a real build's font map", () => {
    expect(code).toContain(BUILT_PRELOADS.files[0]);
    expect(code.length).toBeLessThan(8000);
    expect(code).not.toContain("import ");
    expect(code).not.toContain("zod");
  });

  it("paints only released brands, whatever is stored", () => {
    const only = ENABLED_BRAND_IDS[0];
    for (let day = 0; day < 14; day += 1) {
      const now = new Date(2035, 1, 10 + day, 12, 0);
      for (const brand of BRAND_IDS) {
        const stores: Record<string, string>[] = [
          { ...ANON_ID },
          { ...ANON_ID, "fo:anon-draw": JSON.stringify(draw(dayOf(now), brand)) },
          { ...ANON_ID, "fo:discovered": JSON.stringify([...BRAND_IDS]) },
          {
            ...ANON_ID,
            "fo:account-appearance": snapshot({
              brandPreference: brand,
              appearance: { daily_draw: draw(dayOf(now), brand) }
            })
          },
          {
            ...ANON_ID,
            "fo:shuffle": JSON.stringify({
              identity: `anon:${ANON}`,
              day: dayOf(now),
              brand,
              rounds,
              seq: 1
            })
          }
        ];
        for (const local of stores) {
          expect(runScript(code, now, local).brand).toBe(only);
        }
      }
    }
  });

  it("ignores fo:test-appearance", () => {
    const override = JSON.stringify({ brand: "noir", mode: "dark" });
    const painted = runScript(code, NOW, { ...ANON_ID, "fo:test-appearance": override });
    expect(painted.brand).toBe(STARTING_BRAND);
    expect(painted.scheme).toBe(primaryBase(STARTING_BRAND));
  });

  it("does not read or write the retired keys", () => {
    const local = {
      ...ANON_ID,
      "fo:brand-preference": "noir",
      "fo:brand-last": JSON.stringify({ brand: "noir", day: dayOf(NOW) })
    };
    const painted = runScript(code, NOW, local);
    expect(painted.brand).toBe(STARTING_BRAND);
    expect(painted.keys.sort()).toEqual(Object.keys(local).sort());
  });
});

describe("font preload map", () => {
  it("lists each face once and resolves back to the urls it was built from", () => {
    const urls = builtPreloadUrls();
    const map = buildPreloadMap(urls);
    expect(new Set(map.files).size).toBe(map.files.length);
    expect(map.files.length).toBeLessThan(Object.values(urls).flat().length);
    for (const [brand, expectedUrls] of Object.entries(urls)) {
      const added: string[] = [];
      const doc = {
        createElement: () => ({}) as Record<string, string>,
        head: { appendChild: (link: Record<string, string>) => added.push(link.href) }
      } as unknown as Document;
      preloadBrandFonts(doc, brand, map);
      expect(added).toEqual(expectedUrls);
    }
  });

  it("uses the default brand's faces for an unknown or missing brand", () => {
    const urls = builtPreloadUrls();
    const map = buildPreloadMap(urls);
    for (const brand of ["unknown-brand", undefined]) {
      const added: string[] = [];
      const doc = {
        createElement: () => ({}) as Record<string, string>,
        head: { appendChild: (link: Record<string, string>) => added.push(link.href) }
      } as unknown as Document;
      preloadBrandFonts(doc, brand, map);
      expect(added).toEqual(urls["*"]);
    }
  });
});

describe("pre-paint script (all brands enabled)", () => {
  let code = "";
  beforeAll(async () => {
    code = await buildBrandInitScript(BUILT_PRELOADS, true);
  });

  it("is self-contained", () => {
    expect(code).not.toContain("import ");
    expect(code).not.toContain("zod");
  });

  it("matches resolveAppearance for the situations of 4.6 across two weeks", () => {
    const situations: Array<(now: Date) => Record<string, string>> = [
      // Signed in, same brand day.
      (now) => ({
        ...ANON_ID,
        "fo:account-appearance": snapshot({
          appearance: { daily_draw: draw(dayOf(now), "noir") }
        })
      }),
      // Signed in, new brand day: the script draws with the snapshot's settings.
      (now) => ({
        ...ANON_ID,
        "fo:account-appearance": snapshot({
          appearance: {
            mode_preference: "dark",
            random_excluded_brands: ["festival"],
            discovered_brands: ["ballot", "noir"],
            daily_draw: {
              day: dayOf(now) - 1,
              brand: "ballot",
              rounds: { ceremony: ["refined-gold", "ballot"], cinema: [] }
            }
          }
        })
      }),
      // Signed in, shuffled today; a shuffle of another identity or day is ignored.
      (now) => ({
        ...ANON_ID,
        "fo:account-appearance": snapshot({
          appearance: { daily_draw: draw(dayOf(now), "noir") }
        }),
        "fo:shuffle": JSON.stringify({
          identity: "user:7",
          day: dayOf(now),
          brand: "lightbox",
          rounds,
          seq: 2
        })
      }),
      (now) => ({
        ...ANON_ID,
        "fo:account-appearance": snapshot({
          appearance: { daily_draw: draw(dayOf(now), "noir") }
        }),
        "fo:shuffle": JSON.stringify({
          identity: "user:8",
          day: dayOf(now),
          brand: "lightbox",
          rounds,
          seq: 2
        })
      }),
      (now) => ({
        ...ANON_ID,
        "fo:shuffle": JSON.stringify({
          identity: `anon:${ANON}`,
          day: dayOf(now) - 1,
          brand: "lightbox",
          rounds,
          seq: 2
        })
      }),
      // Signed in, fixed theme.
      () => ({
        ...ANON_ID,
        "fo:account-appearance": snapshot({ brandPreference: "red-carpet" })
      }),
      // Session expired: the snapshot still paints the account's theme, as a guess.
      (now) => ({
        ...ANON_ID,
        "fo:account-appearance": snapshot({
          brandPreference: "random",
          appearance: { daily_draw: draw(dayOf(now), "festival") }
        })
      }),
      // Logged out, returning: saved draw, or the day's draw with browser discoveries.
      (now) => ({
        ...ANON_ID,
        "fo:anon-draw": JSON.stringify(draw(dayOf(now), "ballot"))
      }),
      (now) => ({
        ...ANON_ID,
        "fo:anon-draw": JSON.stringify(draw(dayOf(now) - 1, "ballot")),
        "fo:discovered": JSON.stringify(["ballot", "noir", "technicolor"])
      }),
      // Nothing stored but the id, and malformed values.
      () => ({ ...ANON_ID }),
      () => ({
        ...ANON_ID,
        "fo:account-appearance": "{not json",
        "fo:anon-draw": "[]",
        "fo:discovered": "7",
        "fo:shuffle": "null"
      })
    ];
    for (let offset = 0; offset < 14; offset += 1) {
      for (const hour of [3, 4, 15]) {
        const now = new Date(2035, 1, 10 + offset, hour, 30);
        for (const [index, build] of situations.entries()) {
          const local = build(now);
          const painted = runScript(code, now, local);
          expect(
            { brand: painted.brand, scheme: painted.scheme },
            `situation ${index} @ ${now.toISOString()}`
          ).toEqual(expected(now, local));
        }
      }
    }
  });

  it("paints the primary mode of the draw on a first visit or a fresh device", () => {
    const painted = runScript(code, NOW, {});
    expect(BRAND_IDS).toContain(painted.brand);
    expect(painted.scheme).toBe(primaryBase(painted.brand!));
    // The script keeps the anonymous id so the app computes the same draw, and
    // saves nothing else: the app records the draw after the session check.
    expect(painted.keys).toEqual(["fo:anon-id"]);
  });

  it("paints the primary mode of a dark-first theme", () => {
    const local = {
      ...ANON_ID,
      "fo:anon-draw": JSON.stringify(draw(dayOf(NOW), "noir"))
    };
    expect(runScript(code, NOW, local)).toMatchObject({ brand: "noir", scheme: "dark" });
  });

  it("honours fo:test-appearance first, and ignores an invalid one", () => {
    const base = {
      ...ANON_ID,
      "fo:account-appearance": snapshot({
        appearance: { daily_draw: draw(dayOf(NOW), "noir") }
      })
    };
    expect(
      runScript(code, NOW, {
        ...base,
        "fo:test-appearance": JSON.stringify({ brand: "festival", mode: "dark" })
      })
    ).toMatchObject({ brand: "festival", scheme: "dark" });
    expect(
      runScript(code, NOW, {
        ...base,
        "fo:test-appearance": JSON.stringify({ brand: "festival", mode: "theme" })
      })
    ).toMatchObject({ brand: "festival", scheme: "light" });
    for (const bad of ['{"brand":"gold","mode":"dark"}', '{"brand":"noir"}', "nope"]) {
      expect(runScript(code, NOW, { ...base, "fo:test-appearance": bad })).toMatchObject({
        brand: "noir"
      });
    }
  });

  it("leaves the attributes unset when the script throws", () => {
    const attributes: Record<string, string> = {};
    const sandbox: Record<string, unknown> = {
      // No dataset on the root: the first write throws inside the script.
      document: {
        documentElement: {
          setAttribute: (name: string, value: string) => {
            attributes[name] = value;
          }
        },
        head: { appendChild: () => undefined },
        createElement: () => ({})
      },
      localStorage: new MemoryStorage(ANON_ID),
      sessionStorage: new MemoryStorage()
    };
    sandbox.window = sandbox;
    expect(() => vm.runInNewContext(code, sandbox)).not.toThrow();
    expect(attributes["data-mantine-color-scheme"]).toBeUndefined();
  });
});
