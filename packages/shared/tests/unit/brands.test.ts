import { describe, expect, it } from "vitest";
import {
  BRAND_IDS,
  BRAND_PREFERENCES,
  ENABLED_BRAND_IDS,
  brandDayNumber,
  isBrandPreference,
  localDateTimeFromDate,
  normalizeBrandPreference,
  resolveBrand,
  type LocalDateTime
} from "../../src/brands.js";
import {
  brandPreferenceSchema,
  updatePreferencesBodySchema
} from "../../src/schemas/index.js";

const at = (year: number, month: number, day: number, hour = 12): LocalDateTime => ({
  year,
  month,
  day,
  hour
});

describe("brandDayNumber", () => {
  it("rolls over at 04:00 local", () => {
    expect(brandDayNumber(at(2026, 3, 10, 3))).toBe(brandDayNumber(at(2026, 3, 9, 23)));
    expect(brandDayNumber(at(2026, 3, 10, 4))).toBe(brandDayNumber(at(2026, 3, 9)) + 1);
    expect(brandDayNumber(at(2026, 3, 10, 0))).toBe(brandDayNumber(at(2026, 3, 9)));
  });

  it("is continuous across month and year boundaries", () => {
    expect(brandDayNumber(at(2026, 3, 1)) - brandDayNumber(at(2026, 2, 28))).toBe(1);
    expect(brandDayNumber(at(2028, 3, 1)) - brandDayNumber(at(2028, 2, 28))).toBe(2);
    expect(brandDayNumber(at(2027, 1, 1)) - brandDayNumber(at(2026, 12, 31))).toBe(1);
    expect(brandDayNumber(at(2027, 1, 1, 2))).toBe(brandDayNumber(at(2026, 12, 31)));
  });

  it("is unaffected by DST transitions", () => {
    // Spring forward (23h day) and fall back (25h day) still advance one day.
    expect(brandDayNumber(at(2026, 3, 9)) - brandDayNumber(at(2026, 3, 8))).toBe(1);
    expect(brandDayNumber(at(2026, 11, 2)) - brandDayNumber(at(2026, 11, 1))).toBe(1);
    expect(brandDayNumber(at(2026, 3, 8, 3))).toBe(brandDayNumber(at(2026, 3, 7)));
  });

  it("reads local components from a Date", () => {
    const d = new Date(2026, 5, 15, 3, 59);
    expect(localDateTimeFromDate(d)).toEqual({ year: 2026, month: 6, day: 15, hour: 3 });
  });
});

const ALL = BRAND_IDS;

describe("resolveBrand", () => {
  it("returns a specific brand regardless of date", () => {
    for (const id of BRAND_IDS) {
      expect(
        resolveBrand({ preference: id, now: at(2026, 1, 1), identity: "u", enabled: ALL })
      ).toBe(id);
    }
  });

  it("rotate: same brand for everyone on a day, switching at 04:00", () => {
    const a = resolveBrand({
      preference: "rotate",
      now: at(2026, 5, 5, 3),
      identity: "a",
      enabled: ALL
    });
    const b = resolveBrand({
      preference: "rotate",
      now: at(2026, 5, 4, 20),
      identity: "b",
      enabled: ALL
    });
    expect(a).toBe(b);
    const next = resolveBrand({
      preference: "rotate",
      now: at(2026, 5, 5, 4),
      identity: "a",
      enabled: ALL
    });
    expect(next).toBe(BRAND_IDS[(BRAND_IDS.indexOf(a) + 1) % BRAND_IDS.length]);
  });

  it("rotate: reaches all 7 brands in 7 consecutive days and then repeats", () => {
    const seen = [];
    for (let d = 1; d <= 14; d += 1) {
      seen.push(
        resolveBrand({
          preference: "rotate",
          now: at(2026, 7, d),
          identity: "x",
          enabled: ALL
        })
      );
    }
    expect(new Set(seen.slice(0, 7)).size).toBe(7);
    expect(seen.slice(7)).toEqual(seen.slice(0, 7));
  });

  it("random: deterministic per identity and day", () => {
    const args = {
      preference: "random",
      now: at(2026, 5, 5),
      identity: "user-42",
      enabled: ALL
    };
    expect(resolveBrand(args)).toBe(resolveBrand({ ...args }));
    expect(resolveBrand({ ...args, now: at(2026, 5, 5, 23) })).toBe(resolveBrand(args));
  });

  it("random: rarely repeats the previous day's brand", () => {
    // The avoidance looks one day back only, so a repeat is possible but rare
    // (about 1 in 49) versus 1 in 7 for an unguarded hash.
    let repeats = 0;
    let transitions = 0;
    for (let u = 0; u < 200; u += 1) {
      let prev = "";
      for (let d = 1; d <= 28; d += 1) {
        const brand = resolveBrand({
          preference: "random",
          now: at(2026, 2, d),
          identity: `user-${u}`,
          enabled: ALL
        });
        if (prev) {
          transitions += 1;
          if (brand === prev) repeats += 1;
        }
        prev = brand;
      }
    }
    expect(repeats / transitions).toBeLessThan(0.05);
  });

  it("random: reaches all 7 brands with a roughly even spread", () => {
    const counts = new Map<string, number>();
    const total = 7000;
    for (let u = 0; u < total; u += 1) {
      const brand = resolveBrand({
        preference: "random",
        now: at(2026, 9, 9),
        identity: `anon-${u}`,
        enabled: ALL
      });
      counts.set(brand, (counts.get(brand) ?? 0) + 1);
    }
    expect(counts.size).toBe(7);
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(total / 7 / 1.4);
      expect(n).toBeLessThan((total / 7) * 1.4);
    }
  });

  it("random: differs between people on the same day", () => {
    const brands = new Set(
      Array.from({ length: 30 }, (_, i) =>
        resolveBrand({
          preference: "random",
          now: at(2026, 5, 5),
          identity: `p${i}`,
          enabled: ALL
        })
      )
    );
    expect(brands.size).toBeGreaterThan(1);
  });

  it("falls back to rotate for invalid values", () => {
    const now = at(2026, 5, 5);
    const rotate = resolveBrand({
      preference: "rotate",
      now,
      identity: "u",
      enabled: ALL
    });
    for (const bad of ["nope", "", null, undefined, 3, {}, "ROTATE"]) {
      expect(resolveBrand({ preference: bad, now, identity: "u", enabled: ALL })).toBe(
        rotate
      );
      expect(normalizeBrandPreference(bad)).toBe("rotate");
    }
  });
});

describe("enabled brands", () => {
  const THREE = ["red-carpet", "noir", "lightbox"] as const;

  it("ENABLED_BRAND_IDS is a non-empty subsequence of BRAND_IDS, in order", () => {
    expect(ENABLED_BRAND_IDS.length).toBeGreaterThan(0);
    let from = 0;
    for (const id of ENABLED_BRAND_IDS) {
      const at = BRAND_IDS.indexOf(id, from);
      expect(at).toBeGreaterThanOrEqual(from);
      from = at + 1;
    }
  });

  it("resolves every preference to refined-gold for 14 days by default", () => {
    for (let d = 1; d <= 14; d += 1) {
      for (const preference of [null, "garbage", ...BRAND_PREFERENCES]) {
        expect(
          resolveBrand({ preference, now: at(2026, 7, d), identity: "someone" })
        ).toBe("refined-gold");
      }
    }
  });

  it("treats a slug that is not enabled like rotate", () => {
    const now = at(2026, 7, 9);
    expect(resolveBrand({ preference: "noir", now, identity: "u", enabled: THREE })).toBe(
      "noir"
    );
    expect(
      resolveBrand({ preference: "ballot", now, identity: "u", enabled: THREE })
    ).toBe(resolveBrand({ preference: "rotate", now, identity: "u", enabled: THREE }));
  });

  it("rotate cycles through exactly the injected brands", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 21; d += 1) {
      seen.add(
        resolveBrand({
          preference: "rotate",
          now: at(2026, 7, d),
          identity: "x",
          enabled: THREE
        })
      );
    }
    expect([...seen].sort()).toEqual([...THREE].sort());
  });

  it("random stays within the injected brands", () => {
    for (let u = 0; u < 300; u += 1) {
      expect(THREE).toContain(
        resolveBrand({
          preference: "random",
          now: at(2026, 7, 1 + (u % 20)),
          identity: `u${u}`,
          enabled: THREE
        })
      );
    }
  });

  it("random with a single enabled brand always returns it", () => {
    for (let d = 1; d <= 10; d += 1) {
      expect(
        resolveBrand({
          preference: "random",
          now: at(2026, 7, d),
          identity: "u",
          enabled: ["noir"]
        })
      ).toBe("noir");
    }
  });

  it("with all seven enabled, rotate is BRAND_IDS[day mod 7]", () => {
    for (let d = 1; d <= 28; d += 1) {
      const now = at(2026, 7, d);
      expect(
        resolveBrand({ preference: "rotate", now, identity: "x", enabled: BRAND_IDS })
      ).toBe(BRAND_IDS[brandDayNumber(now) % 7]);
    }
  });
});

describe("brand preference validation", () => {
  it("accepts rotate, random and every brand", () => {
    for (const v of ["rotate", "random", ...BRAND_IDS]) {
      expect(isBrandPreference(v)).toBe(true);
      expect(brandPreferenceSchema.safeParse(v).success).toBe(true);
    }
  });

  it("accepts null to clear and rejects anything else", () => {
    expect(
      updatePreferencesBodySchema.safeParse({ brand_preference: null }).success
    ).toBe(true);
    for (const bad of ["gold", "", 1, undefined, true]) {
      expect(
        updatePreferencesBodySchema.safeParse({ brand_preference: bad }).success
      ).toBe(false);
    }
  });
});
