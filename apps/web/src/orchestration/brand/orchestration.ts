import { useCallback, useEffect, useRef, useState } from "react";
import {
  STARTING_BRAND,
  brandDayNumber,
  localDateTimeFromDate,
  type BrandId,
  type ColorBase,
  type ThemeMode
} from "@fantasy-oscars/shared/brands";
import {
  DEFAULT_APPEARANCE_SETTINGS,
  parseAppearance,
  resolveAppearance,
  type DailyDraw,
  type ResolvedAppearance
} from "@fantasy-oscars/shared/appearance";
import {
  activeShuffle,
  anonymousIdentity,
  testAppearanceTarget,
  userIdentity
} from "../../decisions/brand";
import { parseLegacyMode, pendingAccountMerge } from "../../decisions/appearance";
import { fetchJson } from "../../lib/api";
import { buildEnabledBrands, isTestBuild } from "./buildFlags";
import { planWordmarkShuffle, saveShuffleDiscovery } from "./wordmarkShuffle";
import {
  clearAccountSnapshot,
  clearLegacyColorScheme,
  clearShuffle,
  getAnonymousId,
  loadAccountSnapshot,
  loadAnonDraw,
  loadDiscoveredQueue,
  loadLegacyColorScheme,
  loadShuffle,
  loadTestAppearance,
  retireOldBrandKeys,
  saveAccountSnapshot,
  saveAnonDraw,
  saveDiscoveredQueue
} from "./storage";

/** What the API returns for the signed-in user's saved appearance. */
export type SavedPreferences = {
  brand_preference: string | null;
  appearance: Record<string, unknown>;
};

export type BrandOrchestrationInput = {
  /** Signed-in user (or null) and whether the first session check is still running. */
  user: {
    sub: string;
    brand_preference?: string | null;
    appearance?: Record<string, unknown>;
  } | null;
  authLoading: boolean;
  /** The session check could not be answered (not the same as "no user"). */
  sessionError?: string | null;
  /** Writes `data-mantine-color-scheme` and Mantine's state (from `useMantineColorScheme`). */
  setColorScheme: (base: ColorBase) => void;
  /** Called with the saved values after the boot PATCH succeeds (updates the auth query). */
  onAccountSaved?: (saved: SavedPreferences) => void;
  /** Injectable for tests. */
  now?: () => Date;
  /** Injectable for tests; defaults to the released brands (or all, in a test build). */
  enabled?: readonly BrandId[];
  /** Injectable for tests; defaults to whether this is a test build. */
  testOverride?: boolean;
};

export type BrandOrchestration = {
  /** Theme in effect; null until the session check finishes. */
  brand: BrandId | null;
  /** Mode in effect for that theme. */
  mode: ThemeMode | null;
  /** Shows a theme and mode now (an Appearance change): the attribute and Mantine's state. */
  show: (brand: BrandId, mode: ThemeMode) => void;
  /**
   * The wordmark shuffle (4.9). "shuffled" and "busy" mean the click is handled
   * (the caller prevents navigation); "none" means there was nothing to shuffle
   * and the click is an ordinary link click.
   */
  shuffle: () => "shuffled" | "busy" | "none";
};

/** How long a shuffle waits for the new theme's fonts; the cross-fade itself is CSS. */
const FONT_WAIT_MS = 200;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** `fn` runs inside a view transition where there is one and motion is allowed; instantly otherwise. */
function swapWithTransition(fn: () => void, onDone: () => void): boolean {
  const doc = document as Document & {
    startViewTransition?: (update: () => Promise<void>) => { finished: Promise<unknown> };
  };
  if (typeof doc.startViewTransition !== "function" || prefersReducedMotion()) {
    fn();
    return false;
  }
  const transition = doc.startViewTransition(async () => {
    fn();
    // Give the new face a chance to arrive, but never hold the swap up for long.
    await Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))
    ]);
  });
  void transition.finished.then(onDone, onDone);
  return true;
}

type ShownTheme = Pick<BrandOrchestration, "brand" | "mode">;

function union(...lists: readonly (readonly BrandId[])[]): BrandId[] {
  return [...new Set(lists.flat())];
}

/** A body for PATCH /auth/me/preferences; only provided fields are written. */
type BootPatch = {
  daily_draw?: DailyDraw;
  add_discovered_brands?: BrandId[];
  mode_preference?: "light" | "dark";
};

function applyTheme(
  brand: BrandId,
  base: ColorBase,
  setColorScheme: (base: ColorBase) => void
) {
  const root = document.documentElement;
  if (root.dataset.brand !== brand) root.dataset.brand = brand;
  if (root.getAttribute("data-mantine-color-scheme") !== base) setColorScheme(base);
}

/**
 * The boot sequence (prescription 05, 4.6). Runs when the session check finishes
 * and whenever the identity changes; never on a background refetch.
 *
 * 1. The session check failed: change nothing, write nothing.
 * 2. Retire the old keys.
 * 3. Build the effective state (account values plus the pending merge, or the
 *    logged-out defaults plus this browser's stores).
 * 4. A newer draw in the snapshot than on the server is kept and sent again.
 * 5. Resolve. 6. Apply. 7. Persist locally. 8. Signed in: one PATCH.
 *
 * "No user" after a normal answer takes the logged-out path, which also covers an
 * expired session: the snapshot is removed and nothing is written to the account.
 */
export function useBrandOrchestration(
  input: BrandOrchestrationInput
): BrandOrchestration {
  const { user, authLoading } = input;
  const [enabled] = useState(() => input.enabled ?? buildEnabledBrands());
  const [testOverride] = useState(() => input.testOverride ?? isTestBuild());
  const [state, setState] = useState<ShownTheme>({ brand: null, mode: null });

  // Latest values for the effect, which must not re-run when they change.
  const latest = useRef(input);
  latest.current = input;
  const identityRef = useRef<string | null>(null);
  const patchingRef = useRef<string | null>(null);

  // The anonymous id is created only inside the effect, so a failed or pending
  // session check cannot cause a write.
  const identityKey = user ? userIdentity(user.sub) : "anonymous";
  identityRef.current = identityKey;
  // No user and no answer: unknown, so nothing may change. (A failed background
  // refetch keeps the user and is not this case.)
  const sessionUnknown = !user && Boolean(input.sessionError);

  useEffect(() => {
    if (authLoading || sessionUnknown) return;
    const { user: current, setColorScheme } = latest.current;
    const now = localDateTimeFromDate((latest.current.now ?? (() => new Date()))());
    const day = brandDayNumber(now);
    const identity = current
      ? userIdentity(current.sub)
      : anonymousIdentity(getAnonymousId());

    const show = (resolved: ResolvedAppearance) => {
      applyTheme(resolved.brand, resolved.mode.base, setColorScheme);
      setState({ brand: resolved.brand, mode: resolved.mode });
    };

    if (testOverride) {
      const override = loadTestAppearance(enabled);
      if (override) {
        const target = testAppearanceTarget(override);
        applyTheme(target.brand, target.base, setColorScheme);
        setState({ brand: target.brand, mode: null });
        return;
      }
    }

    retireOldBrandKeys();
    const storedShuffle = loadShuffle(enabled);
    if (
      storedShuffle &&
      (storedShuffle.day !== day || storedShuffle.identity !== identity)
    ) {
      clearShuffle();
    }
    const shuffle = activeShuffle(storedShuffle, identity, day, enabled);

    if (!current) {
      // Logged out, by choice or because the session ended: the snapshot goes.
      clearAccountSnapshot();
      const queue = loadDiscoveredQueue();
      const record = loadAnonDraw(enabled);
      const resolved = resolveAppearance({
        identity,
        day,
        enabled,
        discovered: queue,
        settings: DEFAULT_APPEARANCE_SETTINGS,
        record,
        shuffle
      });
      show(resolved);
      if (resolved.drewNow && resolved.draw) {
        saveAnonDraw(resolved.draw);
        if (resolved.brand !== STARTING_BRAND && !queue.includes(resolved.brand)) {
          saveDiscoveredQueue([...queue, resolved.brand]);
        }
      }
      return;
    }

    // Signed in. Step 3: the account's values plus the pending merge.
    const parsed = parseAppearance(
      { brand_preference: current.brand_preference, appearance: current.appearance },
      enabled
    );
    const queue = loadDiscoveredQueue();
    const legacyRaw = loadLegacyColorScheme();
    if (!parsed.modeUnset && legacyRaw !== null) clearLegacyColorScheme();
    const merge = pendingAccountMerge({
      account: parsed,
      queue,
      legacyMode: parseLegacyMode(legacyRaw)
    });

    // Step 4: a draw whose save failed earlier outranks the server's older one.
    let record = parsed.draw;
    let resend: DailyDraw | null = null;
    const snapshot = loadAccountSnapshot();
    if (snapshot && snapshot.identity === identity) {
      const kept = parseAppearance({ appearance: snapshot.appearance }, enabled).draw;
      if (kept && (!record || kept.day > record.day)) {
        record = kept;
        resend = kept;
      }
    }

    // Step 5.
    const discovered = union(parsed.discovered, merge.addDiscovered);
    const settings = { ...parsed.settings, mode: merge.mode ?? parsed.settings.mode };
    const resolved = resolveAppearance({
      identity,
      day,
      enabled,
      discovered,
      settings,
      record,
      shuffle
    });

    // A theme shown by a completed draw is a discovery, saved with the draw.
    const known = new Set<BrandId>([STARTING_BRAND, ...discovered]);
    const drawn =
      resolved.draw && !known.has(resolved.draw.brand) ? [resolved.draw.brand] : [];
    const sendDraw = resend ?? (resolved.drewNow ? resolved.draw : null);
    const add = union(merge.addDiscovered, drawn);
    const patch: BootPatch = {};
    if (sendDraw) patch.daily_draw = sendDraw;
    if (add.length > 0) patch.add_discovered_brands = add;
    if (merge.mode) patch.mode_preference = merge.mode;

    // Step 6.
    show(resolved);

    // Step 7. Entries the account already has go; the rest stay queued until the
    // save succeeds.
    if (queue.length > 0 || add.length > 0) saveDiscoveredQueue(add);
    saveAccountSnapshot({
      identity,
      brandPreference: current.brand_preference ?? null,
      appearance: {
        ...(current.appearance ?? {}),
        ...(merge.mode ? { mode_preference: merge.mode } : {}),
        discovered_brands: union(parsed.discovered, add),
        daily_draw: sendDraw ?? record
      }
    });

    // Step 8.
    if (Object.keys(patch).length === 0 || patchingRef.current === identity) return;
    patchingRef.current = identity;
    void (async () => {
      try {
        const res = await fetchJson<{ preferences?: SavedPreferences }>(
          "/auth/me/preferences",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch)
          }
        );
        const saved = res.data?.preferences;
        // On failure the local state stays and the next load retries.
        if (!res.ok || !saved || identityRef.current !== identity) return;

        const back = parseAppearance(saved, enabled);
        const sent = patch.daily_draw;
        if (
          sent &&
          back.draw &&
          (back.draw.day !== sent.day || back.draw.brand !== sent.brand)
        ) {
          // Lost the compare-and-set: adopt the account's record, once.
          show(
            resolveAppearance({
              identity,
              day,
              enabled,
              discovered: back.discovered,
              settings: back.settings,
              record: back.draw,
              shuffle
            })
          );
        }
        saveAccountSnapshot({
          identity,
          brandPreference: saved.brand_preference ?? null,
          appearance: saved.appearance ?? {}
        });
        const sentIds = patch.add_discovered_brands ?? [];
        saveDiscoveredQueue(loadDiscoveredQueue().filter((id) => !sentIds.includes(id)));
        if (patch.mode_preference) clearLegacyColorScheme();
        latest.current.onAccountSaved?.(saved);
      } finally {
        patchingRef.current = null;
      }
    })();
  }, [authLoading, sessionUnknown, identityKey, enabled, testOverride]);

  const show = useCallback((brand: BrandId, mode: ThemeMode) => {
    applyTheme(brand, mode.base, latest.current.setColorScheme);
    setState({ brand, mode });
  }, []);

  const shownBrand = useRef<BrandId | null>(null);
  shownBrand.current = state.brand;
  const transitioning = useRef(false);

  const shuffle = useCallback((): "shuffled" | "busy" | "none" => {
    if (transitioning.current) return "busy";
    const { user: current, sessionError } = latest.current;
    const from = shownBrand.current;
    if (!from || (!current && sessionError)) return "none";
    if (testOverride && loadTestAppearance(enabled)) return "none";
    const planned = planWordmarkShuffle({
      user: current,
      current: from,
      enabled,
      now: (latest.current.now ?? (() => new Date()))()
    });
    if (!planned) return "none";

    transitioning.current = swapWithTransition(
      () => show(planned.brand, planned.mode),
      () => {
        transitioning.current = false;
      }
    );
    if (planned.discovery && current) {
      void saveShuffleDiscovery({
        brand: planned.discovery,
        identity: planned.identity,
        stillCurrent: () => identityRef.current === planned.identity,
        onSaved: (saved) => latest.current.onAccountSaved?.(saved)
      });
    }
    return "shuffled";
  }, [enabled, show, testOverride]);

  return { ...state, show, shuffle };
}
