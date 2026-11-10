import {
  BRAND_CATALOG,
  BRAND_IDS,
  ENABLED_BRAND_IDS,
  brandDayNumber,
  isBrandId,
  type BrandId,
  type ColorBase,
  type LocalDateTime
} from "@fantasy-oscars/shared/brands";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  MODE_PREFERENCES,
  isRecord,
  parseAppearance,
  resolveAppearance,
  resolveMode,
  type DailyDraw,
  type ModePreference,
  type ResolvedAppearance
} from "@fantasy-oscars/shared/appearance";

/** The brands in play: the released set, or every brand when the test flag is on. */
export function enabledBrandIds(enableAll: boolean): readonly BrandId[] {
  return enableAll ? BRAND_IDS : ENABLED_BRAND_IDS;
}

/** Identity strings fed to the draw; the pre-paint script and the app must agree. */
export function userIdentity(userId: string): string {
  return `user:${userId}`;
}

export function anonymousIdentity(anonId: string): string {
  return `anon:${anonId}`;
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** What `fo:account-appearance` holds: the account's settings as the API returned them. */
export type AccountSnapshot = {
  identity: string;
  brandPreference: string | null;
  appearance: Record<string, unknown>;
};

export function parseAccountSnapshot(raw: string | null): AccountSnapshot | null {
  const value = parseJson(raw);
  if (!isRecord(value) || typeof value.identity !== "string") return null;
  return {
    identity: value.identity,
    brandPreference:
      typeof value.brandPreference === "string" ? value.brandPreference : null,
    appearance: isRecord(value.appearance) ? value.appearance : {}
  };
}

/** `fo:anon-draw`: a logged-out visitor's daily draw. */
export function parseAnonDraw(
  raw: string | null,
  enabled: readonly BrandId[]
): DailyDraw | null {
  return parseAppearance({ appearance: { daily_draw: parseJson(raw) } }, enabled).draw;
}

/** `fo:discovered`: ids as stored, unreleased ones included (the account takes them all). */
export function parseDiscoveredQueue(raw: string | null): BrandId[] {
  const value = parseJson(raw);
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isBrandId))];
}

/** `fo:shuffle`: the wordmark shuffle of the day (written by the shuffle, read here). */
export type ShuffleRecord = {
  identity: string;
  day: number;
  brand: BrandId;
  rounds: DailyDraw["rounds"];
  seq: number;
};

export function parseShuffleRecord(
  raw: string | null,
  enabled: readonly BrandId[]
): ShuffleRecord | null {
  const value = parseJson(raw);
  if (!isRecord(value) || typeof value.identity !== "string") return null;
  const draw = parseAppearance(
    {
      appearance: {
        daily_draw: { day: value.day, brand: value.brand, rounds: value.rounds }
      }
    },
    enabled
  ).draw;
  if (!draw) return null;
  const seq =
    typeof value.seq === "number" && Number.isInteger(value.seq) ? value.seq : 0;
  return { identity: value.identity, ...draw, seq };
}

/** The shuffled theme, only for the same identity on the same brand day, and while released. */
export function activeShuffle(
  record: ShuffleRecord | null,
  identity: string,
  day: number,
  enabled: readonly BrandId[]
): BrandId | null {
  if (!record || record.identity !== identity || record.day !== day) return null;
  return enabled.includes(record.brand) ? record.brand : null;
}

/** `fo:test-appearance`: honoured only in test builds. */
export type TestAppearance = { brand: BrandId; mode: ModePreference };

export function parseTestAppearance(
  raw: string | null,
  enabled: readonly BrandId[]
): TestAppearance | null {
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  const { brand, mode } = value;
  if (!isBrandId(brand) || !enabled.includes(brand)) return null;
  if (!(MODE_PREFERENCES as readonly unknown[]).includes(mode)) return null;
  return { brand, mode: mode as ModePreference };
}

/** Brand and colour base the test override paints. */
export function testAppearanceTarget(override: TestAppearance): {
  brand: BrandId;
  base: ColorBase;
} {
  const entry = BRAND_CATALOG.find((candidate) => candidate.id === override.brand);
  return {
    brand: override.brand,
    base: entry ? resolveMode(override.mode, entry).base : "light"
  };
}

export type StoredAppearanceState = {
  /** The account snapshot, if one is stored. */
  account: AccountSnapshot | null;
  anonDraw: DailyDraw | null;
  discoveredQueue: readonly BrandId[];
  shuffle: ShuffleRecord | null;
  anonId: string;
  testOverride: TestAppearance | null;
};

/**
 * Best guess for the theme before the session check finishes, so the first paint
 * is already right. A snapshot means "an account was signed in here": its
 * settings and previous draw feed the same draw the app runs after the check.
 * Nothing stored means a first visit or a fresh device: the anonymous draw.
 */
export function resolvePrepaintAppearance(input: {
  stored: StoredAppearanceState;
  now: LocalDateTime;
  enabled: readonly BrandId[];
}): { brand: BrandId; base: ColorBase } {
  const { enabled } = input;
  const { stored } = input;
  const day = brandDayNumber(input.now);

  if (stored.testOverride) return testAppearanceTarget(stored.testOverride);

  const identity = stored.account?.identity ?? anonymousIdentity(stored.anonId);
  const parsed = stored.account
    ? parseAppearance(
        {
          brand_preference: stored.account.brandPreference,
          appearance: stored.account.appearance
        },
        enabled
      )
    : null;
  const resolved: ResolvedAppearance = resolveAppearance({
    identity,
    day,
    enabled,
    discovered: parsed ? parsed.discovered : stored.discoveredQueue,
    settings: parsed ? parsed.settings : DEFAULT_APPEARANCE_SETTINGS,
    record: parsed ? parsed.draw : stored.anonDraw,
    shuffle: activeShuffle(stored.shuffle, identity, day, enabled)
  });
  return { brand: resolved.brand, base: resolved.mode.base };
}
