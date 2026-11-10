import type { BrandId } from "@fantasy-oscars/shared/brands";
import type { DailyDraw } from "@fantasy-oscars/shared/appearance";
import {
  parseAccountSnapshot,
  parseAnonDraw,
  parseDiscoveredQueue,
  parseShuffleRecord,
  parseTestAppearance,
  type AccountSnapshot,
  type ShuffleRecord,
  type StoredAppearanceState,
  type TestAppearance
} from "../../decisions/brand";

const ACCOUNT_KEY = "fo:account-appearance";
const ANON_DRAW_KEY = "fo:anon-draw";
const DISCOVERED_KEY = "fo:discovered";
const SHUFFLE_KEY = "fo:shuffle";
const ANON_ID_KEY = "fo:anon-id";
export const TEST_APPEARANCE_KEY = "fo:test-appearance";
/** Written by the old colour toggle; read once at first login, then removed. */
export const LEGACY_COLOR_SCHEME_KEY = "mantine-color-scheme-value";

/** Keys and stores retired by the day record; removed at every boot. */
const RETIRED_LOCAL_KEYS = ["fo:brand-last", "fo:brand-preference"] as const;
const RETIRED_SESSION_KEYS = ["fo:brand-session"] as const;

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

function read(key: string): string | null {
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    local()?.setItem(key, JSON.stringify(value));
  } catch {
    // Best effort; storage may be blocked.
  }
}

function remove(key: string): void {
  try {
    local()?.removeItem(key);
  } catch {
    // Best effort.
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

/** A stable per-browser id for the logged-out draw. */
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

export function loadAccountSnapshot(): AccountSnapshot | null {
  return parseAccountSnapshot(read(ACCOUNT_KEY));
}

export function saveAccountSnapshot(snapshot: AccountSnapshot): void {
  write(ACCOUNT_KEY, snapshot);
}

export function clearAccountSnapshot(): void {
  remove(ACCOUNT_KEY);
}

export function loadAnonDraw(enabled: readonly BrandId[]): DailyDraw | null {
  return parseAnonDraw(read(ANON_DRAW_KEY), enabled);
}

export function saveAnonDraw(draw: DailyDraw): void {
  write(ANON_DRAW_KEY, draw);
}

export function loadDiscoveredQueue(): BrandId[] {
  return parseDiscoveredQueue(read(DISCOVERED_KEY));
}

/** An empty queue removes the key. */
export function saveDiscoveredQueue(queue: readonly BrandId[]): void {
  if (queue.length === 0) remove(DISCOVERED_KEY);
  else write(DISCOVERED_KEY, [...queue]);
}

export function loadShuffle(enabled: readonly BrandId[]): ShuffleRecord | null {
  return parseShuffleRecord(read(SHUFFLE_KEY), enabled);
}

/** Written on every shuffle; ignored and removed once the day or identity differs. */
export function saveShuffle(record: ShuffleRecord): void {
  write(SHUFFLE_KEY, record);
}

export function clearShuffle(): void {
  remove(SHUFFLE_KEY);
}

export function loadTestAppearance(enabled: readonly BrandId[]): TestAppearance | null {
  return parseTestAppearance(read(TEST_APPEARANCE_KEY), enabled);
}

export function loadLegacyColorScheme(): string | null {
  return read(LEGACY_COLOR_SCHEME_KEY);
}

export function clearLegacyColorScheme(): void {
  remove(LEGACY_COLOR_SCHEME_KEY);
}

/** Removes the keys the day record replaced (the per-tab pin, the last brand, the local preference). */
export function retireOldBrandKeys(): void {
  for (const key of RETIRED_LOCAL_KEYS) remove(key);
  try {
    for (const key of RETIRED_SESSION_KEYS) session()?.removeItem(key);
  } catch {
    // Best effort.
  }
}

/**
 * Everything the pre-paint decision reads. The test override is read only when a
 * reader is given (test builds); the production script never references it, so
 * it is left out of the bundle. Reads the keys directly (not through the loaders
 * above) to keep the pre-paint script small.
 */
export function loadStoredAppearance(input: {
  enabled: readonly BrandId[];
  readTestOverride?: typeof loadTestAppearance;
}): StoredAppearanceState {
  const { enabled } = input;
  return {
    account: parseAccountSnapshot(read(ACCOUNT_KEY)),
    anonDraw: parseAnonDraw(read(ANON_DRAW_KEY), enabled),
    discoveredQueue: parseDiscoveredQueue(read(DISCOVERED_KEY)),
    shuffle: parseShuffleRecord(read(SHUFFLE_KEY), enabled),
    anonId: getAnonymousId(),
    testOverride: input.readTestOverride?.(enabled) ?? null
  };
}
