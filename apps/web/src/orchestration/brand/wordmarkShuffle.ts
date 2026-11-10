import {
  BRAND_CATALOG,
  STARTING_BRAND,
  brandDayNumber,
  localDateTimeFromDate,
  type BrandId,
  type ThemeMode
} from "@fantasy-oscars/shared/brands";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  drawShuffle,
  parseAppearance,
  resolveMode
} from "@fantasy-oscars/shared/appearance";
import { anonymousIdentity, userIdentity } from "../../decisions/brand";
import { fetchJson } from "../../lib/api";
import {
  getAnonymousId,
  loadDiscoveredQueue,
  loadShuffle,
  saveAccountSnapshot,
  saveDiscoveredQueue,
  saveShuffle
} from "./storage";

export type ShuffleUser = {
  sub: string;
  brand_preference?: string | null;
  appearance?: Record<string, unknown>;
} | null;

export type PlannedShuffle = {
  brand: BrandId;
  mode: ThemeMode;
  identity: string;
  /** Set when the shuffled theme is new to this person; the caller records it. */
  discovery: BrandId | null;
};

/**
 * Draws the next shuffle (prescription 05, 4.9) and records it: `fo:shuffle` is
 * read here, at click time, so open tabs share the rounds and `seq`. The
 * account's saved preference and Mode are only read, never written. A new theme
 * is queued in `fo:discovered` until the account confirms it. Returns null when
 * there is nothing else to show.
 */
export function planWordmarkShuffle(input: {
  user: ShuffleUser;
  current: BrandId;
  enabled: readonly BrandId[];
  now: Date;
}): PlannedShuffle | null {
  const { user, current, enabled } = input;
  const day = brandDayNumber(localDateTimeFromDate(input.now));
  const identity = user ? userIdentity(user.sub) : anonymousIdentity(getAnonymousId());

  const stored = loadShuffle(enabled);
  const today =
    stored && stored.identity === identity && stored.day === day ? stored : null;
  const queue = loadDiscoveredQueue();
  const parsed = user
    ? parseAppearance(
        { brand_preference: user.brand_preference, appearance: user.appearance },
        enabled
      )
    : null;
  const settings = parsed ? parsed.settings : DEFAULT_APPEARANCE_SETTINGS;
  const known = [...new Set([...(parsed?.discovered ?? []), ...queue])];
  const seq = today?.seq ?? 0;

  const result = drawShuffle({
    identity,
    day,
    enabled,
    discovered: known,
    settings,
    current,
    rounds: today?.rounds ?? null,
    seq
  });
  if (!result) return null;

  const entry = BRAND_CATALOG.find((candidate) => candidate.id === result.brand);
  if (!entry) return null;

  saveShuffle({
    identity,
    day,
    brand: result.brand,
    rounds: result.rounds,
    seq: seq + 1
  });
  const isNew = result.brand !== STARTING_BRAND && !known.includes(result.brand);
  if (isNew) saveDiscoveredQueue([...queue, result.brand]);
  return {
    brand: result.brand,
    mode: resolveMode(settings.mode, entry),
    identity,
    discovery: isNew ? result.brand : null
  };
}

/**
 * Sends a shuffle's discovery to the signed-in account. On success the queue
 * entry goes and the saved values replace the snapshot; on failure the entry
 * stays queued for the next boot.
 */
export async function saveShuffleDiscovery(input: {
  brand: BrandId;
  identity: string;
  stillCurrent: () => boolean;
  onSaved?: (saved: {
    brand_preference: string | null;
    appearance: Record<string, unknown>;
  }) => void;
}): Promise<void> {
  const res = await fetchJson<{
    preferences?: {
      brand_preference: string | null;
      appearance: Record<string, unknown>;
    };
  }>("/auth/me/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ add_discovered_brands: [input.brand] })
  });
  const saved = res.data?.preferences;
  if (!res.ok || !saved || !input.stillCurrent()) return;
  saveAccountSnapshot({
    identity: input.identity,
    brandPreference: saved.brand_preference ?? null,
    appearance: saved.appearance ?? {}
  });
  saveDiscoveredQueue(loadDiscoveredQueue().filter((id) => id !== input.brand));
  input.onSaved?.(saved);
}
