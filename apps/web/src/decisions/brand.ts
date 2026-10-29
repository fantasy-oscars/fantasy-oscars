import {
  isBrandId,
  isBrandPreference,
  type BrandId,
  type BrandPreference
} from "@fantasy-oscars/shared";

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
