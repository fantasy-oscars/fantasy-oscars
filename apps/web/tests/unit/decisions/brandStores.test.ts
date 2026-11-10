import { describe, expect, it } from "vitest";
import { BRAND_IDS, ENABLED_BRAND_IDS } from "@fantasy-oscars/shared/brands";
import {
  activeShuffle,
  anonymousIdentity,
  enabledBrandIds,
  parseAccountSnapshot,
  parseAnonDraw,
  parseDiscoveredQueue,
  parseShuffleRecord,
  parseTestAppearance,
  resolvePrepaintAppearance,
  testAppearanceTarget,
  userIdentity,
  type StoredAppearanceState
} from "@/decisions/brand";
import { parseLegacyMode, pendingAccountMerge } from "@/decisions/appearance";

const rounds = { ceremony: [], cinema: [] };
const NOW = { year: 2026, month: 5, day: 5, hour: 12 };

const empty: StoredAppearanceState = {
  account: null,
  anonDraw: null,
  discoveredQueue: [],
  shuffle: null,
  anonId: "a",
  testOverride: null
};

describe("identities and enabled brands", () => {
  it("builds the identity strings the draw is seeded with", () => {
    expect(userIdentity("42")).toBe("user:42");
    expect(anonymousIdentity("abc")).toBe("anon:abc");
  });

  it("enables the released set, or every brand for the test flag", () => {
    expect(enabledBrandIds(false)).toBe(ENABLED_BRAND_IDS);
    expect(enabledBrandIds(true)).toBe(BRAND_IDS);
  });
});

describe("store parsers", () => {
  it("parses the account snapshot and rejects malformed values", () => {
    const raw = JSON.stringify({
      identity: "user:7",
      brandPreference: "noir",
      appearance: { mode_preference: "dark" }
    });
    expect(parseAccountSnapshot(raw)).toEqual({
      identity: "user:7",
      brandPreference: "noir",
      appearance: { mode_preference: "dark" }
    });
    expect(
      parseAccountSnapshot(JSON.stringify({ identity: "user:7", appearance: 3 }))
    ).toEqual({ identity: "user:7", brandPreference: null, appearance: {} });
    for (const bad of [null, "", "{nope", "[]", '{"identity":7}']) {
      expect(parseAccountSnapshot(bad)).toBeNull();
    }
  });

  it("parses the anonymous draw and drops unreleased themes", () => {
    const raw = JSON.stringify({ day: 5, brand: "noir", rounds });
    expect(parseAnonDraw(raw, BRAND_IDS)).toEqual({ day: 5, brand: "noir", rounds });
    expect(parseAnonDraw(raw, ["refined-gold"])).toBeNull();
    expect(parseAnonDraw("garbage", BRAND_IDS)).toBeNull();
  });

  it("parses the discovery queue: known ids only, deduplicated", () => {
    expect(parseDiscoveredQueue('["ballot","ballot","gold",3,"noir"]')).toEqual([
      "ballot",
      "noir"
    ]);
    expect(parseDiscoveredQueue("{}")).toEqual([]);
    expect(parseDiscoveredQueue(null)).toEqual([]);
  });

  it("parses the shuffle record and applies it only today, for the same identity", () => {
    const raw = JSON.stringify({
      identity: "user:7",
      day: 5,
      brand: "lightbox",
      rounds,
      seq: 3
    });
    const record = parseShuffleRecord(raw, BRAND_IDS);
    expect(record).toEqual({
      identity: "user:7",
      day: 5,
      brand: "lightbox",
      rounds,
      seq: 3
    });
    expect(activeShuffle(record, "user:7", 5, BRAND_IDS)).toBe("lightbox");
    expect(activeShuffle(record, "user:8", 5, BRAND_IDS)).toBeNull();
    expect(activeShuffle(record, "user:7", 6, BRAND_IDS)).toBeNull();
    expect(activeShuffle(record, "user:7", 5, ["refined-gold"])).toBeNull();
    expect(parseShuffleRecord('{"identity":"u","day":5}', BRAND_IDS)).toBeNull();
  });

  it("parses the test override: released brand and a known mode only", () => {
    expect(parseTestAppearance('{"brand":"noir","mode":"dark"}', BRAND_IDS)).toEqual({
      brand: "noir",
      mode: "dark"
    });
    expect(
      parseTestAppearance('{"brand":"noir","mode":"dark"}', ["refined-gold"])
    ).toBeNull();
    expect(parseTestAppearance('{"brand":"noir","mode":"sepia"}', BRAND_IDS)).toBeNull();
    expect(parseTestAppearance("x", BRAND_IDS)).toBeNull();
  });

  it("resolves the override's colour base through the theme's modes", () => {
    expect(testAppearanceTarget({ brand: "noir", mode: "theme" })).toEqual({
      brand: "noir",
      base: "dark"
    });
    expect(testAppearanceTarget({ brand: "noir", mode: "light" }).base).toBe("light");
  });
});

describe("resolvePrepaintAppearance", () => {
  it("paints the starting theme's primary mode on a first visit with one theme released", () => {
    expect(
      resolvePrepaintAppearance({ stored: empty, now: NOW, enabled: ["refined-gold"] })
    ).toEqual({
      brand: "refined-gold",
      base: "light"
    });
  });

  it("lets the test override win over everything stored", () => {
    const stored = {
      ...empty,
      testOverride: { brand: "noir" as const, mode: "light" as const }
    };
    expect(resolvePrepaintAppearance({ stored, now: NOW, enabled: BRAND_IDS })).toEqual({
      brand: "noir",
      base: "light"
    });
  });
});

describe("legacy mode and the merge at login", () => {
  it("accepts only light or dark", () => {
    expect(parseLegacyMode("light")).toBe("light");
    expect(parseLegacyMode("dark")).toBe("dark");
    for (const bad of [null, "auto", "", "Dark"]) expect(parseLegacyMode(bad)).toBeNull();
  });

  it("sends discoveries the account lacks, skipping the starting theme and duplicates", () => {
    expect(
      pendingAccountMerge({
        account: { discovered: ["noir"], modeUnset: false },
        queue: ["ballot", "noir", "refined-gold", "ballot", "gold"],
        legacyMode: null
      })
    ).toEqual({ addDiscovered: ["ballot"], mode: null });
  });

  it("copies the legacy mode only while the account has none", () => {
    const base = { discovered: [], queue: [] as string[] };
    expect(
      pendingAccountMerge({
        ...base,
        account: { discovered: [], modeUnset: true },
        legacyMode: "dark"
      }).mode
    ).toBe("dark");
    expect(
      pendingAccountMerge({
        ...base,
        account: { discovered: [], modeUnset: false },
        legacyMode: "dark"
      }).mode
    ).toBeNull();
    expect(
      pendingAccountMerge({
        ...base,
        account: { discovered: [], modeUnset: true },
        legacyMode: null
      }).mode
    ).toBeNull();
  });
});
