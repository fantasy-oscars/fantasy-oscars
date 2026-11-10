import { mergeAppearancePatches, type AppearancePatch } from "../../decisions/appearance";
import type { SavedPreferences } from "./orchestration";

export type SaveOutcome = { ok: true; saved: SavedPreferences } | { ok: false };

export type SaveQueueState = {
  /** A PATCH is in flight. */
  saving: boolean;
  /** Everything not yet saved: the request in flight plus later changes. */
  outstanding: AppearancePatch;
  /** The last failed batch, kept so Retry can send it again; cleared by any new change. */
  failed: AppearancePatch | null;
};

/**
 * Serialises appearance saves (prescription 05, 4.8): one PATCH in flight, later
 * changes merged into the next. A failure drops everything outstanding (the
 * caller rolls the view back) and keeps it for `retry`.
 */
export function createAppearanceSaveQueue(options: {
  send: (patch: AppearancePatch) => Promise<SaveOutcome>;
  onSaved: (saved: SavedPreferences, sent: AppearancePatch) => void;
  onFailed: (failed: AppearancePatch) => void;
  onChange: (state: SaveQueueState) => void;
}) {
  let inFlight: AppearancePatch | null = null;
  let pending: AppearancePatch = {};
  let failed: AppearancePatch | null = null;

  const outstanding = () => mergeAppearancePatches(inFlight ?? {}, pending);
  const snapshot = (): SaveQueueState => ({
    saving: inFlight !== null,
    outstanding: outstanding(),
    failed
  });
  const emit = () => options.onChange(snapshot());

  async function pump(): Promise<void> {
    if (inFlight || Object.keys(pending).length === 0) return;
    const sent = pending;
    inFlight = sent;
    pending = {};
    emit();

    let outcome: SaveOutcome;
    try {
      outcome = await options.send(sent);
    } catch {
      outcome = { ok: false };
    }

    if (outcome.ok) {
      inFlight = null;
      options.onSaved(outcome.saved, sent);
      emit();
      await pump();
      return;
    }
    failed = mergeAppearancePatches(sent, pending);
    inFlight = null;
    pending = {};
    options.onFailed(failed);
    emit();
  }

  const queue = {
    enqueue(patch: AppearancePatch): Promise<void> {
      failed = null;
      pending = mergeAppearancePatches(pending, patch);
      emit();
      return pump();
    },
    /** Sends the failed batch again. */
    retry(): Promise<void> {
      const again = failed;
      if (!again) return Promise.resolve();
      return queue.enqueue(again);
    },
    state: snapshot
  };
  return queue;
}

export type AppearanceSaveQueue = ReturnType<typeof createAppearanceSaveQueue>;
