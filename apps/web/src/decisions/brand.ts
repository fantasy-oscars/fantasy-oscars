import {
  brandDayNumber,
  isBrandId,
  isBrandPreference,
  resolveBrand,
  type BrandId,
  type BrandPreference,
  type LocalDateTime
} from "@fantasy-oscars/shared/brands";

/**
 * Effective preference: a signed-in user's saved preference wins; if they have
 * none yet, a locally chosen one is used (and adopted by the account); else
 * the default, which the resolver treats as "rotate".
 */
export function effectiveBrandPreference(input: {
  signedIn: boolean;
  serverPreference: unknown;
  localPreference: BrandPreference | null;
}): BrandPreference | null {
  if (input.signedIn && isBrandPreference(input.serverPreference)) {
    return input.serverPreference;
  }
  return input.localPreference;
}

/** Whether a signed-in user's local choice should be copied to their account. */
export function shouldAdoptLocalPreference(input: {
  signedIn: boolean;
  serverPreference: unknown;
  localPreference: BrandPreference | null;
}): boolean {
  return (
    input.signedIn &&
    !isBrandPreference(input.serverPreference) &&
    input.localPreference !== null
  );
}

/** What a pinned brand was resolved from; a different key means re-resolve. */
export function brandPinKey(identity: string, preference: BrandPreference | null) {
  return `${identity}|${preference ?? "unset"}`;
}

export type BrandPin = { brand: BrandId; day: number; key: string };

export function parseBrandPin(raw: string | null): BrandPin | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { brand, day, key } = value as Record<string, unknown>;
    if (!isBrandId(brand) || typeof key !== "string") return null;
    if (typeof day !== "number" || !Number.isFinite(day)) return null;
    return { brand, day, key };
  } catch {
    return null;
  }
}

/** A pin is reused only for the same inputs on the same brand day. */
export function isPinReusable(pin: BrandPin | null, key: string, day: number): boolean {
  return pin !== null && pin.key === key && pin.day === day;
}

/** Identity strings fed to the resolver; the pre-paint script and the app must agree. */
export function userIdentity(userId: string): string {
  return `user:${userId}`;
}

export function anonymousIdentity(anonId: string): string {
  return `anon:${anonId}`;
}

/** The last brand resolved for a signed-in user, cached in localStorage. */
export type LastBrand = { brand: BrandId; day: number };

export function parseLastBrand(raw: string | null): LastBrand | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { brand, day } = value as Record<string, unknown>;
    if (!isBrandId(brand)) return null;
    if (typeof day !== "number" || !Number.isFinite(day)) return null;
    return { brand, day };
  } catch {
    return null;
  }
}

/**
 * Best guess for the brand before the session check finishes, so the first
 * paint is already right. Order: this tab's pin, the cached last brand of a
 * signed-in user, then the signed-out resolution. The app corrects it after the
 * session check if the guess was wrong (for example a changed account preference).
 * A pin or cache from an earlier brand day is ignored.
 */
export function resolvePrepaintBrand(input: {
  pin: BrandPin | null;
  last: LastBrand | null;
  localPreference: BrandPreference | null;
  anonId: string;
  now: LocalDateTime;
}): BrandId {
  const day = brandDayNumber(input.now);
  if (input.pin && input.pin.day === day) return input.pin.brand;
  if (input.last && input.last.day === day) return input.last.brand;
  return resolveBrand({
    preference: input.localPreference,
    now: input.now,
    identity: anonymousIdentity(input.anonId)
  });
}
