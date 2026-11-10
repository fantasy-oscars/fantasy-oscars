import { describe, expect, it } from "vitest";
import {
  buildGroups,
  drawDaily,
  drawShuffle,
  groupShares,
  hasRandomSelection,
  parseAppearance,
  pickGroup,
  resolveAppearance,
  resolveMode,
  seedFraction,
  seedHash,
  type AppearanceSettings,
  type DailyDraw,
  type DrawRounds,
  type DrawSettings
} from "../../src/appearance.js";
import {
  BRAND_CATALOG,
  BRAND_IDS,
  DARK_MODE,
  LIGHT_MODE,
  type BrandCatalogEntry,
  type BrandId
} from "../../src/brands.js";
import { updatePreferencesBodySchema } from "../../src/schemas/index.js";

const id = (slug: string) => slug as BrandId;

const C7 = BRAND_IDS;
const cinemaA = id("cinema-a");
const cinemaB = id("cinema-b");
const cinemaC = id("cinema-c");
const FIXTURE: readonly BrandCatalogEntry[] = [
  ...BRAND_CATALOG,
  { id: cinemaA, collection: "cinema", modes: [LIGHT_MODE, DARK_MODE] },
  { id: cinemaB, collection: "cinema", modes: [{ id: "sepia", base: "dark" }] },
  { id: cinemaC, collection: "cinema", modes: [DARK_MODE, LIGHT_MODE] }
];
const FIXTURE_ENABLED: readonly BrandId[] = [...C7, cinemaA, cinemaB, cinemaC];

const DEFAULTS: DrawSettings = {
  mode: "theme",
  excluded: [],
  undiscoveredEnabled: true,
  singleModePolicy: "own"
};

const DAY = 20766;
const USER = "user:42";

function run(
  identity: string,
  days: number[],
  opts: {
    settings?: (day: number) => DrawSettings;
    previous?: DailyDraw | null;
    discovered?: readonly BrandId[];
    enabled?: readonly BrandId[];
  } = {}
) {
  let previous = opts.previous ?? null;
  return days.map((day) => {
    previous = drawDaily({
      identity,
      day,
      enabled: opts.enabled ?? C7,
      discovered: opts.discovered ?? [],
      settings: opts.settings?.(day) ?? DEFAULTS,
      previous
    });
    return previous;
  });
}

const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => from + i);

describe("seed", () => {
  it("is deterministic and a fraction below 1", () => {
    expect(seedHash("a", 1)).toBe(seedHash("a", 1));
    expect(seedHash("a", 1)).not.toBe(seedHash("a", 2));
    const f = seedFraction(USER, DAY, "group");
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThan(1);
  });
});

describe("daily draw vectors (prescription 4.3)", () => {
  it("example 1: default draw for user:42", () => {
    const rolls = range(DAY, 9).map((day) => seedFraction(USER, day, "group").toFixed(4));
    expect(rolls).toEqual([
      "0.4343",
      "0.3386",
      "0.2071",
      "0.2118",
      "0.3061",
      "0.6084",
      "0.2650",
      "0.3047",
      "0.0802"
    ]);
    const days = run(USER, range(DAY, 9));
    expect(days.map((d) => d.brand)).toEqual([
      "festival",
      "refined-gold",
      "noir",
      "ballot",
      "red-carpet",
      "lightbox",
      "technicolor",
      "festival",
      "red-carpet"
    ]);
  });

  it("example 1: logged-out anon:3f1c", () => {
    expect(run("anon:3f1c", range(DAY, 3)).map((d) => d.brand)).toEqual([
      "technicolor",
      "noir",
      "refined-gold"
    ]);
  });

  it("example 1: no repeat inside a round and none on consecutive days", () => {
    for (let n = 0; n < 40; n += 1) {
      const draws = run(`user:${n}`, range(DAY, 70));
      for (let round = 0; round < 10; round += 1) {
        const slice = draws.slice(round * 7, round * 7 + 7).map((d) => d.brand);
        expect(new Set(slice).size).toBe(7);
      }
      for (let i = 1; i < draws.length; i += 1) {
        expect(draws[i]!.brand).not.toBe(draws[i - 1]!.brand);
      }
    }
  });

  it("example 2: cinema fixture, a discovered cinema theme in the 5 % group", () => {
    const day = 20774;
    const roll = seedFraction(USER, day, "group");
    expect(roll.toFixed(4)).toBe("0.0802");
    const discovered = [cinemaA];
    const pools = buildGroups({
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered,
      settings: DEFAULTS
    });
    expect(pools.cinemaNew).toEqual([cinemaB, cinemaC]);
    expect(pools.cinemaSeen).toEqual([cinemaA]);
    expect(pools.ceremony).toEqual([...C7]);
    const shares = groupShares(pools);
    expect(shares).toMatchObject({ cinemaNew: 0.05, cinemaSeen: 0.05 });
    expect(shares.ceremony).toBeCloseTo(0.9, 10);
    expect(pickGroup(pools, roll)).toBe("cinemaSeen");
    const draw = drawDaily({
      identity: USER,
      day,
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered,
      settings: DEFAULTS,
      previous: null
    });
    expect(draw.brand).toBe(cinemaA);
    expect(draw.rounds).toEqual({ ceremony: [], cinema: [cinemaA] });
  });

  it("example 2: other rolls pick the other groups", () => {
    const pools = buildGroups({
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered: [cinemaA],
      settings: DEFAULTS
    });
    expect(pickGroup(pools, 0.0124)).toBe("cinemaNew");
    expect(pickGroup(pools, 0.0519)).toBe("cinemaSeen");
    expect(pickGroup(pools, 0.0663)).toBe("cinemaSeen");
    expect(pickGroup(pools, 0.1)).toBe("ceremony");
    expect(pickGroup(pools, 0.9999)).toBe("ceremony");
  });

  it("example 3: a selection that changes mid-round", () => {
    const first = run(USER, range(DAY, 3));
    expect(first.map((d) => d.brand)).toEqual(["festival", "refined-gold", "noir"]);
    const narrowed: DrawSettings = { ...DEFAULTS, excluded: ["festival", "noir"] };
    const rest = run(USER, range(DAY + 3, 6), {
      settings: () => narrowed,
      // Excluding a theme implies it was discovered.
      discovered: C7,
      previous: first[2]!
    });
    expect(rest.map((d) => d.brand)).toEqual([
      "ballot",
      "red-carpet",
      "lightbox",
      "technicolor",
      "ballot",
      "red-carpet"
    ]);
    expect(rest[3]!.rounds.ceremony).toEqual([
      "festival",
      "refined-gold",
      "noir",
      "ballot",
      "red-carpet",
      "lightbox",
      "technicolor"
    ]);
    expect(rest[4]!.rounds.ceremony).toEqual(["ballot"]);
  });

  it("example 4: only Cinema selected", () => {
    const settings: DrawSettings = { ...DEFAULTS, excluded: [...C7] };
    const discovered = [...C7, cinemaA, cinemaB];
    const pools = buildGroups({
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered,
      settings
    });
    expect(pools).toEqual({
      cinemaNew: [cinemaC],
      cinemaSeen: [cinemaA, cinemaB],
      ceremony: []
    });
    expect(groupShares(pools)).toEqual({ cinemaNew: 0.5, cinemaSeen: 0.5, ceremony: 0 });
    const draw = drawDaily({
      identity: USER,
      day: DAY,
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered,
      settings,
      previous: null
    });
    expect(draw.brand).toBe(cinemaC);

    const off = buildGroups({
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered,
      settings: { ...settings, undiscoveredEnabled: false }
    });
    expect(off.cinemaNew).toEqual([]);
    expect(groupShares(off)).toEqual({ cinemaNew: 0, cinemaSeen: 1, ceremony: 0 });
  });

  it("example 5: single-mode policy, with the use-them-anyway restore", () => {
    const light: DrawSettings = {
      ...DEFAULTS,
      mode: "light",
      singleModePolicy: "exclude"
    };
    const pools = buildGroups({
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered: [cinemaB],
      settings: light
    });
    expect(pools).toEqual({
      cinemaNew: [cinemaA, cinemaC],
      cinemaSeen: [],
      ceremony: [...C7]
    });

    const restored = buildGroups({
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered: [cinemaB],
      settings: { ...light, excluded: ["refined-gold"], undiscoveredEnabled: false }
    });
    expect(restored).toEqual({ cinemaNew: [], cinemaSeen: [cinemaB], ceremony: [] });
    expect(groupShares(restored).cinemaSeen).toBe(1);
  });

  it("example 5: the policy does nothing in Theme default mode", () => {
    const pools = buildGroups({
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered: [cinemaB],
      settings: { ...DEFAULTS, singleModePolicy: "exclude" }
    });
    expect(pools.cinemaSeen).toEqual([cinemaB]);
  });

  it("example 6: Undiscovered off", () => {
    const pools = buildGroups({
      catalog: FIXTURE,
      enabled: FIXTURE_ENABLED,
      discovered: [cinemaA],
      settings: { ...DEFAULTS, undiscoveredEnabled: false }
    });
    expect(pools).toEqual({
      cinemaNew: [],
      cinemaSeen: [cinemaA],
      ceremony: ["refined-gold"]
    });
    const shares = groupShares(pools);
    expect(shares).toMatchObject({ cinemaNew: 0, cinemaSeen: 0.05 });
    expect(shares.ceremony).toBeCloseTo(0.95, 10);
  });
});

describe("buildGroups", () => {
  it("with one theme enabled the pools hold only that theme", () => {
    const pools = buildGroups({ discovered: [], settings: DEFAULTS });
    expect(pools).toEqual({ cinemaNew: [], cinemaSeen: [], ceremony: ["refined-gold"] });
  });

  it("ignores discoveries that are not enabled", () => {
    const pools = buildGroups({ discovered: ["noir"], settings: DEFAULTS });
    expect(pools.ceremony).toEqual(["refined-gold"]);
  });

  it("the floor selects every known theme when nothing else is left", () => {
    const pools = buildGroups({
      discovered: [],
      settings: { ...DEFAULTS, excluded: ["refined-gold"], undiscoveredEnabled: false }
    });
    expect(pools.ceremony).toEqual(["refined-gold"]);
    const draw = drawDaily({
      identity: USER,
      day: DAY,
      discovered: [],
      settings: { ...DEFAULTS, excluded: ["refined-gold"], undiscoveredEnabled: false },
      previous: null
    });
    expect(draw.brand).toBe("refined-gold");
  });

  it("a lone theme may repeat", () => {
    const draws = run(USER, range(DAY, 3), { enabled: ["refined-gold"] });
    expect(new Set(draws.map((d) => d.brand))).toEqual(new Set(["refined-gold"]));
  });
});

describe("hasRandomSelection", () => {
  it("is false only when every option is off", () => {
    const base = { discovered: [] as BrandId[], excluded: [] as BrandId[] };
    expect(hasRandomSelection({ ...base, undiscoveredEnabled: true })).toBe(true);
    expect(
      hasRandomSelection({
        ...base,
        excluded: ["refined-gold"],
        undiscoveredEnabled: false
      })
    ).toBe(false);
    expect(
      hasRandomSelection({
        catalog: FIXTURE,
        enabled: FIXTURE_ENABLED,
        ...base,
        excluded: ["refined-gold"],
        undiscoveredEnabled: true
      })
    ).toBe(true);
  });
});

describe("resolveMode", () => {
  const dark = BRAND_CATALOG.find((e) => e.id === "noir")!;
  const single = FIXTURE.find((e) => e.id === cinemaB)!;

  it("theme default is the primary mode", () => {
    expect(resolveMode("theme", dark)).toEqual(DARK_MODE);
    expect(resolveMode("theme", BRAND_CATALOG[0]!)).toEqual(LIGHT_MODE);
  });

  it("light and dark pick the mode on that base", () => {
    expect(resolveMode("light", dark)).toEqual(LIGHT_MODE);
    expect(resolveMode("dark", BRAND_CATALOG[0]!)).toEqual(DARK_MODE);
  });

  it("a single-mode theme uses its only mode", () => {
    expect(resolveMode("light", single)).toEqual({ id: "sepia", base: "dark" });
    expect(resolveMode("dark", single).base).toBe("dark");
  });
});

describe("resolveAppearance", () => {
  const settings: AppearanceSettings = { ...DEFAULTS, fixed: null };
  const base = { identity: USER, day: DAY, discovered: [] as BrandId[], settings };

  it("draws when there is no record and says so", () => {
    const result = resolveAppearance({ ...base, record: null });
    expect(result.drewNow).toBe(true);
    expect(result.draw?.day).toBe(DAY);
  });

  it("never redraws while today's record exists, and keeps a record from a later day", () => {
    const record: DailyDraw = {
      day: DAY + 1,
      brand: "refined-gold",
      rounds: { ceremony: ["refined-gold"], cinema: [] }
    };
    const result = resolveAppearance({ ...base, record });
    expect(result).toMatchObject({ brand: "refined-gold", drewNow: false, draw: record });
  });

  it("ignores a record whose theme is not released", () => {
    const record: DailyDraw = {
      day: DAY,
      brand: "noir",
      rounds: { ceremony: [], cinema: [] }
    };
    expect(resolveAppearance({ ...base, record }).drewNow).toBe(true);
  });

  it("Fixed and shuffle take precedence and draw nothing", () => {
    const fixed = resolveAppearance({
      ...base,
      enabled: ["refined-gold", "noir"],
      settings: { ...settings, fixed: "noir" },
      record: null
    });
    expect(fixed).toMatchObject({ brand: "noir", drewNow: false, draw: null });
    const shuffled = resolveAppearance({
      ...base,
      enabled: ["refined-gold", "noir"],
      settings: { ...settings, fixed: "refined-gold" },
      record: null,
      shuffle: "noir"
    });
    expect(shuffled.brand).toBe("noir");
  });

  it("resolves the mode for the resulting theme", () => {
    const result = resolveAppearance({
      ...base,
      enabled: ["noir"],
      settings: { ...settings, mode: "light" },
      record: null
    });
    expect(result.brand).toBe("noir");
    expect(result.mode).toEqual(LIGHT_MODE);
  });
});

describe("parseAppearance", () => {
  const enabled: readonly BrandId[] = ["refined-gold", "noir"];

  it("defaults for NULL, rotate, random and unknown", () => {
    for (const brand_preference of [null, undefined, "rotate", "random", "gold", 3]) {
      const parsed = parseAppearance(
        { brand_preference, appearance: undefined },
        enabled
      );
      expect(parsed.settings).toEqual({
        fixed: null,
        mode: "theme",
        excluded: [],
        undiscoveredEnabled: true,
        singleModePolicy: "own"
      });
      expect(parsed.fixedUnavailable).toBe(false);
      expect(parsed.modeUnset).toBe(true);
      expect(parsed.draw).toBeNull();
    }
  });

  it("a released slug is Fixed; an unreleased slug is Random with a note", () => {
    expect(parseAppearance({ brand_preference: "noir" }, enabled).settings.fixed).toBe(
      "noir"
    );
    const unreleased = parseAppearance({ brand_preference: "ballot" }, enabled);
    expect(unreleased.settings.fixed).toBeNull();
    expect(unreleased.fixedUnavailable).toBe(true);
  });

  it("filters unreleased and unknown ids and keeps valid values", () => {
    const parsed = parseAppearance(
      {
        brand_preference: null,
        appearance: {
          mode_preference: "dark",
          random_excluded_brands: ["noir", "ballot", "nope", "noir"],
          undiscovered_enabled: false,
          single_mode_policy: "exclude",
          discovered_brands: ["ballot", "noir"],
          daily_draw: {
            day: 5,
            brand: "noir",
            rounds: { ceremony: ["noir", "ballot"], cinema: "x" }
          }
        }
      },
      enabled
    );
    expect(parsed.settings).toMatchObject({
      mode: "dark",
      excluded: ["noir"],
      undiscoveredEnabled: false,
      singleModePolicy: "exclude"
    });
    expect(parsed.modeUnset).toBe(false);
    expect(parsed.discovered).toEqual(["noir"]);
    expect(parsed.draw).toEqual({
      day: 5,
      brand: "noir",
      rounds: { ceremony: ["noir"], cinema: [] }
    });
  });

  it("ignores a daily draw naming an unreleased theme or a bad day", () => {
    const draw = (brand: string, day: unknown) =>
      parseAppearance({ appearance: { daily_draw: { day, brand, rounds: {} } } }, enabled)
        .draw;
    expect(draw("ballot", 5)).toBeNull();
    expect(draw("noir", 1.5)).toBeNull();
    expect(draw("noir", "5")).toBeNull();
  });

  it("falls back for invalid scalar values", () => {
    const parsed = parseAppearance(
      {
        appearance: {
          mode_preference: "sepia",
          undiscovered_enabled: "yes",
          single_mode_policy: "other"
        }
      },
      enabled
    );
    expect(parsed.settings).toMatchObject({
      mode: "theme",
      undiscoveredEnabled: true,
      singleModePolicy: "own"
    });
  });
});

describe("updatePreferencesBodySchema", () => {
  const today = Math.floor(Date.now() / 86_400_000);
  const draw = (day: number) => ({
    day,
    brand: "noir",
    rounds: { ceremony: ["noir"], cinema: [] }
  });

  it("requires at least one field", () => {
    expect(updatePreferencesBodySchema.safeParse({}).success).toBe(false);
    expect(updatePreferencesBodySchema.safeParse({ nothing: 1 }).success).toBe(false);
    expect(
      updatePreferencesBodySchema.safeParse({ brand_preference: undefined }).success
    ).toBe(false);
    expect(
      updatePreferencesBodySchema.safeParse({ brand_preference: null }).success
    ).toBe(true);
    expect(updatePreferencesBodySchema.safeParse({ mode_preference: null }).success).toBe(
      true
    );
    expect(
      updatePreferencesBodySchema.safeParse({ undiscovered_enabled: false }).success
    ).toBe(true);
  });

  it("accepts a day within two of the UTC day and rejects further", () => {
    for (const offset of [-2, -1, 0, 1, 2]) {
      expect(
        updatePreferencesBodySchema.safeParse({ daily_draw: draw(today + offset) })
          .success
      ).toBe(true);
    }
    for (const offset of [-3, 3, 400]) {
      expect(
        updatePreferencesBodySchema.safeParse({ daily_draw: draw(today + offset) })
          .success
      ).toBe(false);
    }
    expect(
      updatePreferencesBodySchema.safeParse({ daily_draw: draw(today + 0.5) }).success
    ).toBe(false);
  });

  it("is strict about the daily draw shape", () => {
    const parse = (daily_draw: unknown) =>
      updatePreferencesBodySchema.safeParse({ daily_draw }).success;
    expect(parse({ ...draw(today), extra: 1 })).toBe(false);
    expect(parse({ ...draw(today), rounds: { ceremony: [] } })).toBe(false);
    expect(
      parse({ ...draw(today), rounds: { ceremony: [], cinema: [], other: [] } })
    ).toBe(false);
    expect(parse({ ...draw(today), brand: "gold" })).toBe(false);
    expect(parse({ ...draw(today), rounds: { ceremony: ["gold"], cinema: [] } })).toBe(
      false
    );
  });

  it("dedupes lists and bounds their length", () => {
    const parsed = updatePreferencesBodySchema.parse({
      random_excluded_brands: ["noir", "noir", "ballot"],
      add_discovered_brands: []
    });
    expect(parsed.random_excluded_brands).toEqual(["noir", "ballot"]);
    expect(
      updatePreferencesBodySchema.safeParse({
        random_excluded_brands: [...BRAND_IDS, "noir"]
      }).success
    ).toBe(false);
    expect(
      updatePreferencesBodySchema.safeParse({ add_discovered_brands: ["gold"] }).success
    ).toBe(false);
  });

  it("validates the scalar fields", () => {
    const ok = (body: object) => updatePreferencesBodySchema.safeParse(body).success;
    expect(ok({ mode_preference: "theme" })).toBe(true);
    expect(ok({ mode_preference: "sepia" })).toBe(false);
    expect(ok({ single_mode_policy: "exclude" })).toBe(true);
    expect(ok({ single_mode_policy: null })).toBe(false);
    expect(ok({ undiscovered_enabled: "no" })).toBe(false);
    expect(ok({ brand_preference: "rotate" })).toBe(true);
    expect(ok({ brand_preference: "gold" })).toBe(false);
  });
});

describe("drawShuffle", () => {
  const RANDOM: AppearanceSettings = { ...DEFAULTS, fixed: null };

  /** Shuffles `count` times, feeding each result back in as the next `current`. */
  function shuffleRun(
    count: number,
    opts: {
      current: BrandId;
      settings: AppearanceSettings;
      discovered: readonly BrandId[];
      enabled?: readonly BrandId[];
      catalog?: readonly BrandCatalogEntry[];
    }
  ) {
    let rounds: DrawRounds | null = null;
    let current = opts.current;
    const shown: (BrandId | null)[] = [];
    for (let seq = 0; seq < count; seq += 1) {
      const result = drawShuffle({
        identity: USER,
        day: DAY,
        enabled: opts.enabled ?? C7,
        catalog: opts.catalog,
        discovered: opts.discovered,
        settings: opts.settings,
        current,
        rounds,
        seq
      });
      shown.push(result?.brand ?? null);
      if (!result) break;
      rounds = result.rounds;
      current = result.brand;
    }
    return shown;
  }

  it("follows the worked example under Random (4.9)", () => {
    expect(
      shuffleRun(7, {
        current: id("festival"),
        settings: RANDOM,
        discovered: [id("festival")]
      })
    ).toEqual([
      "ballot",
      "technicolor",
      "red-carpet",
      "noir",
      "refined-gold",
      "lightbox",
      // Seven themes seen: a new round starts and `current` (lightbox) is out of it.
      "technicolor"
    ]);
  });

  it("stays within the discovered themes under Fixed, never the current one", () => {
    const fixed = { ...RANDOM, fixed: id("ballot") };
    const shown = shuffleRun(4, {
      current: id("ballot"),
      settings: fixed,
      discovered: [id("ballot"), id("noir")]
    });
    expect(shown).toEqual(["noir", "refined-gold", "noir", "ballot"]);
  });

  it("ignores the exclusions and undiscovered themes under Fixed", () => {
    const fixed = { ...RANDOM, fixed: id("noir"), excluded: [id("ballot")] };
    const shown = shuffleRun(20, {
      current: id("noir"),
      settings: fixed,
      discovered: [id("noir"), id("ballot")]
    });
    expect(new Set(shown)).toEqual(new Set(["ballot", "refined-gold", "noir"]));
  });

  it("never repeats the current theme", () => {
    for (const seed of ["user:1", "user:2", "anon:x"]) {
      let rounds: DrawRounds | null = null;
      let current: BrandId = id("festival");
      for (let seq = 0; seq < 40; seq += 1) {
        const result = drawShuffle({
          identity: seed,
          day: DAY,
          enabled: C7,
          discovered: [],
          settings: RANDOM,
          current,
          rounds,
          seq
        })!;
        expect(result.brand).not.toBe(current);
        rounds = result.rounds;
        current = result.brand;
      }
    }
  });

  it("shows every theme before any repeats within a round", () => {
    const shown = shuffleRun(6, {
      current: id("festival"),
      settings: RANDOM,
      discovered: []
    });
    expect(new Set(shown).size).toBe(6);
    expect(shown).not.toContain("festival");
  });

  it("starts the first shuffle of the day with the current theme in its round", () => {
    const result = drawShuffle({
      identity: USER,
      day: DAY,
      enabled: C7,
      discovered: [],
      settings: RANDOM,
      current: id("festival"),
      rounds: null,
      seq: 0
    })!;
    expect(result.rounds.ceremony).toEqual(["festival", result.brand]);
    expect(result.rounds.cinema).toEqual([]);
  });

  it("is deterministic for the same inputs and varies with seq", () => {
    const base = {
      identity: USER,
      day: DAY,
      enabled: C7,
      discovered: [] as BrandId[],
      settings: RANDOM,
      current: id("festival"),
      rounds: null
    };
    expect(drawShuffle({ ...base, seq: 0 })).toEqual(drawShuffle({ ...base, seq: 0 }));
    const brands = [0, 1, 2, 3, 4, 5, 6, 7].map(
      (seq) => drawShuffle({ ...base, seq })!.brand
    );
    expect(new Set(brands).size).toBeGreaterThan(1);
  });

  it("returns null when only the current theme is left", () => {
    const only = [id("noir")];
    expect(
      drawShuffle({
        identity: USER,
        day: DAY,
        enabled: only,
        discovered: [],
        settings: RANDOM,
        current: id("noir"),
        rounds: null,
        seq: 0
      })
    ).toBeNull();
    // Fixed with one discovered theme (the starting one, which is always known).
    expect(
      drawShuffle({
        identity: USER,
        day: DAY,
        enabled: C7,
        discovered: [],
        settings: { ...RANDOM, fixed: id("refined-gold") },
        current: id("refined-gold"),
        rounds: null,
        seq: 0
      })
    ).toBeNull();
    // Random with only today's theme selected and Undiscovered off.
    expect(
      drawShuffle({
        identity: USER,
        day: DAY,
        enabled: C7,
        discovered: [],
        settings: {
          ...RANDOM,
          undiscoveredEnabled: false
        },
        current: id("refined-gold"),
        rounds: null,
        seq: 0
      })
    ).toBeNull();
  });

  it("uses the daily groups and odds: Cinema stays at about 5 % each", () => {
    let cinema = 0;
    const trials = 4000;
    for (let seq = 0; seq < trials; seq += 1) {
      const result = drawShuffle({
        identity: "user:odds",
        day: DAY,
        enabled: FIXTURE_ENABLED,
        catalog: FIXTURE,
        discovered: [cinemaA],
        settings: RANDOM,
        current: id("festival"),
        rounds: null,
        seq
      })!;
      if (result.brand.startsWith("cinema-")) cinema += 1;
    }
    // cinemaNew 5 % plus cinemaSeen 5 %.
    expect(cinema / trials).toBeGreaterThan(0.07);
    expect(cinema / trials).toBeLessThan(0.13);
  });

  it("keeps the single-mode policy", () => {
    const settings: AppearanceSettings = {
      ...RANDOM,
      mode: "light",
      singleModePolicy: "exclude"
    };
    const shown = shuffleRun(40, {
      current: id("festival"),
      settings,
      discovered: [cinemaB],
      enabled: FIXTURE_ENABLED,
      catalog: FIXTURE
    });
    expect(shown).not.toContain(cinemaB);
  });
});
