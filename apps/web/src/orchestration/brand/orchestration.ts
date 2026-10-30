import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_BRAND_PREFERENCE,
  brandDayNumber,
  localDateTimeFromDate,
  resolveBrand,
  type BrandId,
  type BrandPreference
} from "@fantasy-oscars/shared";
import {
  brandPinKey,
  effectiveBrandPreference,
  isPinReusable,
  shouldAdoptLocalPreference
} from "../../decisions/brand";
import { fetchJson } from "../../lib/api";
import {
  getAnonymousId,
  loadBrandPin,
  loadLocalBrandPreference,
  saveBrandPin,
  saveLocalBrandPreference
} from "./storage";

export type BrandOrchestrationInput = {
  /** Signed-in user (or null) and whether the first session check is still running. */
  user: { sub: string; brand_preference?: string | null } | null;
  authLoading: boolean;
  /** Re-reads the session so the saved preference shows up on `user`. */
  refreshAuth: () => Promise<void>;
  /** Injectable for tests. */
  now?: () => Date;
};

export type BrandOrchestration = {
  /** Brand in effect for this session; null until the session check finishes. */
  brand: BrandId | null;
  /** The preference in effect ("rotate" when none is saved). */
  preference: BrandPreference;
  /** Saves the preference (account when signed in, this browser otherwise) and re-resolves. */
  setPreference: (next: BrandPreference) => Promise<{ ok: boolean }>;
};

/**
 * Resolves the brand once per session and pins it: the result is stored in
 * sessionStorage with its brand day and reused until the identity or the
 * preference changes (login, logout, picker). The clock crossing 04:00 never
 * restyles a running session; a new tab or a reload on a later day re-resolves.
 *
 * Preference sources: signed in, the account's saved value wins; if the account
 * has none, a locally chosen value is used and copied to the account once.
 * Signed out, the value lives in localStorage.
 */
export function useBrandOrchestration(
  input: BrandOrchestrationInput
): BrandOrchestration {
  const { user, authLoading, refreshAuth } = input;
  const nowRef = useRef(input.now ?? (() => new Date()));
  nowRef.current = input.now ?? (() => new Date());

  const [localPreference, setLocalPreference] = useState(loadLocalBrandPreference);
  const [brand, setBrand] = useState<BrandId | null>(null);

  const signedIn = user !== null;
  const serverPreference = user?.brand_preference ?? null;
  const preference = effectiveBrandPreference({
    signedIn,
    serverPreference,
    localPreference
  });
  const identity = user ? `user:${user.sub}` : `anon:${getAnonymousId()}`;

  useEffect(() => {
    if (authLoading) return;
    const now = localDateTimeFromDate(nowRef.current());
    const day = brandDayNumber(now);
    const key = brandPinKey(identity, preference);
    const pin = loadBrandPin();
    if (pin && isPinReusable(pin, key, day)) {
      setBrand(pin.brand);
      return;
    }
    const resolved = resolveBrand({ preference, now, identity });
    saveBrandPin({ brand: resolved, day, key });
    setBrand(resolved);
  }, [authLoading, identity, preference]);

  useEffect(() => {
    if (brand) document.documentElement.dataset.brand = brand;
  }, [brand]);

  // Copy a locally chosen preference to an account that has none, once.
  const adoptingRef = useRef(false);
  useEffect(() => {
    if (authLoading || adoptingRef.current) return;
    if (!shouldAdoptLocalPreference({ signedIn, serverPreference, localPreference })) {
      return;
    }
    adoptingRef.current = true;
    void (async () => {
      const res = await fetchJson("/auth/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_preference: localPreference })
      });
      if (res.ok) {
        saveLocalBrandPreference(null);
        setLocalPreference(null);
        await refreshAuth();
      }
      adoptingRef.current = false;
    })();
  }, [authLoading, signedIn, serverPreference, localPreference, refreshAuth]);

  const setPreference = useCallback(
    async (next: BrandPreference) => {
      if (signedIn) {
        const res = await fetchJson("/auth/me/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand_preference: next })
        });
        if (!res.ok) return { ok: false };
        await refreshAuth();
        return { ok: true };
      }
      const stored = next === DEFAULT_BRAND_PREFERENCE ? null : next;
      saveLocalBrandPreference(stored);
      setLocalPreference(stored);
      return { ok: true };
    },
    [signedIn, refreshAuth]
  );

  return { brand, preference: preference ?? DEFAULT_BRAND_PREFERENCE, setPreference };
}
