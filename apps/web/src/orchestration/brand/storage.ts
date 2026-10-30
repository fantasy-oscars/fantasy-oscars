import { isBrandPreference, type BrandPreference } from "@fantasy-oscars/shared/brands";
import {
  parseBrandPin,
  parseLastBrand,
  type BrandPin,
  type LastBrand
} from "../../decisions/brand";

const LOCAL_PREFERENCE_KEY = "fo:brand-preference";
const ANON_ID_KEY = "fo:anon-id";
const SESSION_PIN_KEY = "fo:brand-session";
const LAST_BRAND_KEY = "fo:brand-last";

function local(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadLocalBrandPreference(): BrandPreference | null {
  try {
    const raw = local()?.getItem(LOCAL_PREFERENCE_KEY) ?? null;
    return isBrandPreference(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** `null` removes the stored preference. */
export function saveLocalBrandPreference(value: BrandPreference | null): void {
  try {
    const storage = local();
    if (!storage) return;
    if (value === null) storage.removeItem(LOCAL_PREFERENCE_KEY);
    else storage.setItem(LOCAL_PREFERENCE_KEY, value);
  } catch {
    // Best effort; storage may be blocked.
  }
}

let memoryAnonId: string | null = null;

function newId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** A stable per-browser id for "random" when logged out. */
export function getAnonymousId(): string {
  try {
    const storage = local();
    const existing = storage?.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const created = newId();
    storage?.setItem(ANON_ID_KEY, created);
    return created;
  } catch {
    memoryAnonId ??= newId();
    return memoryAnonId;
  }
}

export function loadBrandPin(): BrandPin | null {
  try {
    return parseBrandPin(session()?.getItem(SESSION_PIN_KEY) ?? null);
  } catch {
    return null;
  }
}

export function saveBrandPin(pin: BrandPin): void {
  try {
    session()?.setItem(SESSION_PIN_KEY, JSON.stringify(pin));
  } catch {
    // Best effort.
  }
}

export function loadLastBrand(): LastBrand | null {
  try {
    return parseLastBrand(local()?.getItem(LAST_BRAND_KEY) ?? null);
  } catch {
    return null;
  }
}

export function saveLastBrand(last: LastBrand): void {
  try {
    local()?.setItem(LAST_BRAND_KEY, JSON.stringify(last));
  } catch {
    // Best effort.
  }
}

export function clearLastBrand(): void {
  try {
    local()?.removeItem(LAST_BRAND_KEY);
  } catch {
    // Best effort.
  }
}
