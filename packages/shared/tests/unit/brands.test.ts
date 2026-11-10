import { describe, expect, it } from "vitest";
import {
  BRAND_CATALOG,
  BRAND_IDS,
  BRAND_LABELS,
  STARTING_BRAND,
  ENABLED_BRAND_IDS,
  brandDayNumber,
  isBrandPreference,
  localDateTimeFromDate,
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

describe("enabled brands", () => {
  it("ENABLED_BRAND_IDS is a non-empty subsequence of BRAND_IDS, in order", () => {
    expect(ENABLED_BRAND_IDS.length).toBeGreaterThan(0);
    let from = 0;
    for (const id of ENABLED_BRAND_IDS) {
      const at = BRAND_IDS.indexOf(id, from);
      expect(at).toBeGreaterThanOrEqual(from);
      from = at + 1;
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

describe("brand catalog", () => {
  it("has one entry per brand id, in order, with a label", () => {
    expect(BRAND_CATALOG.map((entry) => entry.id)).toEqual([...BRAND_IDS]);
    for (const id of BRAND_IDS) expect(BRAND_LABELS[id]).toBeTruthy();
  });

  it("declares at most one mode per base and a primary mode first", () => {
    for (const entry of BRAND_CATALOG) {
      const bases = entry.modes.map((mode) => mode.base);
      expect(new Set(bases).size).toBe(bases.length);
    }
    const primary = Object.fromEntries(BRAND_CATALOG.map((e) => [e.id, e.modes[0].base]));
    expect(primary).toEqual({
      "refined-gold": "light",
      "red-carpet": "dark",
      ballot: "light",
      noir: "dark",
      festival: "light",
      technicolor: "light",
      lightbox: "light"
    });
  });

  it("starts everyone on an enabled theme", () => {
    expect(ENABLED_BRAND_IDS).toContain(STARTING_BRAND);
  });
});
