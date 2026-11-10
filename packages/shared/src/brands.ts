/**
 * Brands: the selectable visual identities. Ids are stable slugs; BRAND_IDS is
 * append only, because stored values and draw rounds name them.
 */
export const BRAND_IDS = [
  "refined-gold",
  "red-carpet",
  "ballot",
  "noir",
  "festival",
  "technicolor",
  "lightbox"
] as const;

export type BrandId = (typeof BRAND_IDS)[number];

/** Preference values other than a specific brand. */
export const BRAND_MODES = ["rotate", "random"] as const;
export type BrandMode = (typeof BRAND_MODES)[number];

export type BrandPreference = BrandMode | BrandId;

/**
 * Brands released to users (a non-empty subsequence of BRAND_IDS). Anything
 * left out is defined but not selectable or drawn.
 */
export const ENABLED_BRAND_IDS: readonly BrandId[] = BRAND_IDS;

export const COLOR_BASES = ["light", "dark"] as const;
export type ColorBase = (typeof COLOR_BASES)[number];

/** One mode a theme offers. A mode that is neither light nor dark names its nearest base. */
export type ThemeMode = { id: string; base: ColorBase };

export const LIGHT_MODE: ThemeMode = { id: "light", base: "light" };
export const DARK_MODE: ThemeMode = { id: "dark", base: "dark" };

export const BRAND_COLLECTIONS = ["ceremony", "cinema"] as const;
export type BrandCollection = (typeof BRAND_COLLECTIONS)[number];

export type BrandCatalogEntry = {
  id: BrandId;
  collection: BrandCollection;
  /** First entry is the theme's primary mode ("Theme default"). At most one mode per base. */
  modes: readonly [ThemeMode, ...ThemeMode[]];
};

const LIGHT_FIRST = [LIGHT_MODE, DARK_MODE] as const;
const DARK_FIRST = [DARK_MODE, LIGHT_MODE] as const;

const ceremony = (id: BrandId, modes: BrandCatalogEntry["modes"]): BrandCatalogEntry => ({
  id,
  collection: "ceremony",
  modes
});

export const BRAND_CATALOG: readonly BrandCatalogEntry[] = [
  ceremony("refined-gold", LIGHT_FIRST),
  ceremony("red-carpet", DARK_FIRST),
  ceremony("ballot", LIGHT_FIRST),
  ceremony("noir", DARK_FIRST),
  ceremony("festival", LIGHT_FIRST),
  ceremony("technicolor", LIGHT_FIRST),
  ceremony("lightbox", LIGHT_FIRST)
];

/** Kept apart from the catalog so the pre-paint script can tree-shake it. */
export const BRAND_LABELS: Record<BrandId, string> = {
  "refined-gold": "Refined Gold",
  "red-carpet": "Red Carpet",
  ballot: "Ballot",
  noir: "Noir",
  festival: "Festival",
  technicolor: "Technicolor",
  lightbox: "Lightbox"
};

/** Counted as discovered for everyone and never stored. */
export const STARTING_BRAND: BrandId = "refined-gold";

/** The brand day rolls over at this local hour (a 02:00 session is still "yesterday"). */
export const BRAND_DAY_START_HOUR = 4;

export function isBrandId(value: unknown): value is BrandId {
  return typeof value === "string" && (BRAND_IDS as readonly string[]).includes(value);
}

export function isBrandPreference(value: unknown): value is BrandPreference {
  return (
    (typeof value === "string" && (BRAND_MODES as readonly string[]).includes(value)) ||
    isBrandId(value)
  );
}

export function isEnabledBrandId(
  value: unknown,
  enabled: readonly BrandId[] = ENABLED_BRAND_IDS
): value is BrandId {
  return isBrandId(value) && enabled.includes(value);
}

/** Wall-clock components in the viewer's local time zone. `month` is 1-12. */
export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

export function localDateTimeFromDate(date: Date): LocalDateTime {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours()
  };
}

const MS_PER_DAY = 86_400_000;

/**
 * Whole days since 1970-01-01 of the brand day containing `now`. Computed from
 * the local calendar date (not elapsed time), so DST shifts cannot move it:
 * before 04:00 local the previous calendar date counts.
 */
export function brandDayNumber(now: LocalDateTime): number {
  const calendarDay = Math.floor(Date.UTC(now.year, now.month - 1, now.day) / MS_PER_DAY);
  return now.hour < BRAND_DAY_START_HOUR ? calendarDay - 1 : calendarDay;
}
