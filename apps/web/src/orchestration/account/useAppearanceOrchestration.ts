import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  brandDayNumber,
  localDateTimeFromDate,
  type BrandId,
  type ThemeMode
} from "@fantasy-oscars/shared/brands";
import {
  parseAppearance,
  resolveAppearance,
  type ParsedAppearance
} from "@fantasy-oscars/shared/appearance";
import {
  applyAppearancePatch,
  deriveAppearanceView,
  pageForValues,
  planAppearanceChange,
  type AppearanceChange,
  type AppearancePatch,
  type AppearanceView,
  type SaveStatus
} from "../../decisions/appearance";
import { userIdentity } from "../../decisions/brand";
import { fetchJson } from "../../lib/api";
import { setSavedPreferences } from "../brand/accountCache";
import {
  createAppearanceSaveQueue,
  type AppearanceSaveQueue,
  type SaveOutcome,
  type SaveQueueState
} from "../brand/appearanceSaveQueue";
import type { SavedPreferences } from "../brand/orchestration";
import { buildEnabledBrands } from "../brand/buildFlags";
import { clearShuffle, saveAccountSnapshot } from "../brand/storage";

/** How long "Saved" stays up after a save. */
export const SAVED_STATUS_MS = 2000;

export type AppearanceOrchestrationInput = {
  user: {
    sub: string;
    brand_preference?: string | null;
    appearance?: Record<string, unknown>;
  };
  /** The theme on screen (from the brand context). */
  currentBrand: BrandId | null;
  /** Repaints the page: the attribute and Mantine's colour scheme. */
  show: (brand: BrandId, mode: ThemeMode) => void;
  /** Injectable for tests. */
  enabled?: readonly BrandId[];
  now?: () => Date;
  send?: (patch: AppearancePatch) => Promise<SaveOutcome>;
};

async function sendPreferences(patch: AppearancePatch): Promise<SaveOutcome> {
  const res = await fetchJson<{ preferences?: SavedPreferences }>(
    "/auth/me/preferences",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    }
  );
  const saved = res.data?.preferences;
  return res.ok && saved ? { ok: true, saved } : { ok: false };
}

/**
 * The Appearance section's state and writes (prescription 05, 4.8): optimistic
 * values over the saved ones, a serialised save queue, rollback on failure.
 * Mode and Fixed changes repaint the page at once; Random-list changes wait for
 * the next draw.
 */
export function useAppearanceOrchestration(input: AppearanceOrchestrationInput) {
  const queryClient = useQueryClient();
  const [enabled] = useState(() => input.enabled ?? buildEnabledBrands());
  const [queueState, setQueueState] = useState<SaveQueueState>({
    saving: false,
    outstanding: {},
    failed: null
  });
  const [showSaved, setShowSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);

  const saved = useMemo<ParsedAppearance>(
    () =>
      parseAppearance(
        {
          brand_preference: input.user.brand_preference,
          appearance: input.user.appearance
        },
        enabled
      ),
    [input.user.brand_preference, input.user.appearance, enabled]
  );

  const latest = useRef({ input, saved, enabled });
  latest.current = { input, saved, enabled };

  const dayAndIdentity = useCallback(() => {
    const { input: current } = latest.current;
    const now = localDateTimeFromDate((current.now ?? (() => new Date()))());
    return { day: brandDayNumber(now), identity: userIdentity(current.user.sub) };
  }, []);

  const [queue] = useState<AppearanceSaveQueue>(() =>
    createAppearanceSaveQueue({
      send: (patch) => (latest.current.input.send ?? sendPreferences)(patch),
      onSaved: (response, sent) => {
        const { input: current, enabled: released } = latest.current;
        setSavedPreferences(queryClient, response);
        saveAccountSnapshot({
          identity: userIdentity(current.user.sub),
          brandPreference: response.brand_preference ?? null,
          appearance: response.appearance
        });
        const back = parseAppearance(response, released);
        if (
          sent.daily_draw &&
          back.draw &&
          (back.draw.day !== sent.daily_draw.day ||
            back.draw.brand !== sent.daily_draw.brand)
        ) {
          // Lost the compare-and-set: the account's record is the day's theme.
          const { day, identity } = dayAndIdentity();
          const resolved = resolveAppearance({
            identity,
            day,
            enabled: released,
            discovered: back.discovered,
            settings: back.settings,
            record: back.draw
          });
          current.show(resolved.brand, resolved.mode);
        }
        if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
        setShowSaved(true);
        savedTimer.current = window.setTimeout(() => {
          savedTimer.current = null;
          setShowSaved(false);
        }, SAVED_STATUS_MS);
      },
      onFailed: (failed) => {
        // Mode and Fixed changes were painted at once; paint the saved values back.
        if (
          failed.mode_preference === undefined &&
          failed.brand_preference === undefined
        ) {
          return;
        }
        const { input: current, saved: last, enabled: released } = latest.current;
        const page = pageForValues(last, {
          enabled: released,
          currentBrand: current.currentBrand,
          day: dayAndIdentity().day
        });
        if (page) current.show(page.brand, page.mode);
      },
      onChange: setQueueState
    })
  );

  useEffect(
    () => () => {
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    },
    []
  );

  const optimistic = useMemo(
    () => applyAppearancePatch(saved, queueState.outstanding, enabled),
    [saved, queueState.outstanding, enabled]
  );
  const view: AppearanceView = useMemo(
    () => deriveAppearanceView(optimistic, { enabled }),
    [optimistic, enabled]
  );

  const change = useCallback(
    (next: AppearanceChange) => {
      const { input: current, enabled: released } = latest.current;
      const { day, identity } = dayAndIdentity();
      // Plan against what the person sees, which includes unsaved changes.
      const plan = planAppearanceChange(
        next,
        applyAppearancePatch(latest.current.saved, queue.state().outstanding, released),
        { enabled: released, currentBrand: current.currentBrand, identity, day }
      );
      if (!plan) return;
      if (plan.page) current.show(plan.page.brand, plan.page.mode);
      if (plan.clearShuffle) clearShuffle();
      void queue.enqueue(plan.patch);
    },
    [dayAndIdentity, queue]
  );

  const retry = useCallback(() => {
    const failed = queue.state().failed;
    if (!failed) return;
    const { input: current, enabled: released } = latest.current;
    // Retry sends the failed change again, so the page follows it again too.
    if (failed.mode_preference !== undefined || failed.brand_preference !== undefined) {
      const page = pageForValues(
        applyAppearancePatch(latest.current.saved, failed, released),
        {
          enabled: released,
          currentBrand: current.currentBrand,
          day: dayAndIdentity().day
        }
      );
      if (page) current.show(page.brand, page.mode);
    }
    void queue.retry();
  }, [dayAndIdentity, queue]);

  const status: SaveStatus = queueState.saving ? "saving" : showSaved ? "saved" : "idle";

  return { view, status, failed: queueState.failed !== null, change, retry };
}
