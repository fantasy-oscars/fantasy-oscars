/**
 * Brands: the selectable visual identities. Ids are stable slugs; the order of
 * BRAND_IDS is the fixed rotation order and must not change once shipped.
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

export const BRAND_PREFERENCES = [...BRAND_MODES, ...BRAND_IDS] as const;
export type BrandPreference = (typeof BRAND_PREFERENCES)[number];

export const DEFAULT_BRAND_PREFERENCE: BrandPreference = "rotate";

/** The brand day rolls over at this local hour (a 02:00 session is still "yesterday"). */
export const BRAND_DAY_START_HOUR = 4;

export function isBrandId(value: unknown): value is BrandId {
  return typeof value === "string" && (BRAND_IDS as readonly string[]).includes(value);
}

export function isBrandPreference(value: unknown): value is BrandPreference {
  return (
    typeof value === "string" && (BRAND_PREFERENCES as readonly string[]).includes(value)
  );
}

/** Any unknown stored value falls back to the default ("rotate"). */
export function normalizeBrandPreference(value: unknown): BrandPreference {
  return isBrandPreference(value) ? value : DEFAULT_BRAND_PREFERENCE;
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

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** 32-bit FNV-1a. Stable across runtimes, so every device agrees. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function randomIndex(identity: string, day: number): number {
  return hash32(`${identity}|${day}`) % BRAND_IDS.length;
}

export function rotateBrand(day: number): BrandId {
  return BRAND_IDS[mod(day, BRAND_IDS.length)]!;
}

/**
 * A per-identity brand for the day: a hash of (identity, day). If it would
 * repeat yesterday's pick, it moves forward by a hash-derived 1..6 steps.
 */
export function randomBrand(identity: string, day: number): BrandId {
  const index = randomIndex(identity, day);
  const yesterday = randomIndex(identity, day - 1);
  if (index !== yesterday) return BRAND_IDS[index]!;
  const step = 1 + (hash32(`${identity}|step|${day}`) % (BRAND_IDS.length - 1));
  return BRAND_IDS[(index + step) % BRAND_IDS.length]!;
}

/**
 * Pure brand resolution.
 * - a specific brand: that brand
 * - "random": per identity (user id or anonymous per-browser id) and day
 * - "rotate" (and any invalid value): the same brand for everyone on a given day
 */
export function resolveBrand(input: {
  preference: unknown;
  now: LocalDateTime;
  identity: string;
}): BrandId {
  const preference = normalizeBrandPreference(input.preference);
  if (isBrandId(preference)) return preference;
  const day = brandDayNumber(input.now);
  return preference === "random" ? randomBrand(input.identity, day) : rotateBrand(day);
}
