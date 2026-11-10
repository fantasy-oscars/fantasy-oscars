import { describe, expect, it, vi } from "vitest";
import {
  createAppearanceSaveQueue,
  type SaveOutcome,
  type SaveQueueState
} from "@/orchestration/brand/appearanceSaveQueue";
import type { AppearancePatch } from "@/decisions/appearance";

const SAVED = { brand_preference: null, appearance: {} };

function deferred() {
  let resolve!: (outcome: SaveOutcome) => void;
  const promise = new Promise<SaveOutcome>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup(send: (patch: AppearancePatch) => Promise<SaveOutcome>) {
  const states: SaveQueueState[] = [];
  const onSaved = vi.fn();
  const onFailed = vi.fn();
  const queue = createAppearanceSaveQueue({
    send,
    onSaved,
    onFailed,
    onChange: (state) => states.push(state)
  });
  return { queue, states, onSaved, onFailed };
}

describe("appearance save queue", () => {
  it("sends one request at a time and merges later changes into the next", async () => {
    const first = deferred();
    const second = deferred();
    const send = vi
      .fn<(patch: AppearancePatch) => Promise<SaveOutcome>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { queue, onSaved } = setup(send);

    void queue.enqueue({ mode_preference: "dark" });
    void queue.enqueue({ single_mode_policy: "exclude" });
    void queue.enqueue({ mode_preference: "light" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith({ mode_preference: "dark" });
    expect(queue.state().saving).toBe(true);
    expect(queue.state().outstanding).toEqual({
      mode_preference: "light",
      single_mode_policy: "exclude"
    });

    first.resolve({ ok: true, saved: SAVED });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send).toHaveBeenLastCalledWith({
      mode_preference: "light",
      single_mode_policy: "exclude"
    });
    expect(onSaved).toHaveBeenCalledTimes(1);

    second.resolve({ ok: true, saved: SAVED });
    await vi.waitFor(() => expect(queue.state().saving).toBe(false));
    expect(onSaved).toHaveBeenCalledTimes(2);
    expect(queue.state().outstanding).toEqual({});
  });

  it("a failure drops what was outstanding, keeps it for Retry and reports it", async () => {
    const send = vi
      .fn<(patch: AppearancePatch) => Promise<SaveOutcome>>()
      .mockResolvedValueOnce({ ok: false });
    const { queue, onFailed, onSaved } = setup(send);

    await queue.enqueue({ mode_preference: "dark" });
    expect(onFailed).toHaveBeenCalledWith({ mode_preference: "dark" });
    expect(onSaved).not.toHaveBeenCalled();
    expect(queue.state()).toEqual({
      saving: false,
      outstanding: {},
      failed: { mode_preference: "dark" }
    });
  });

  it("changes made while a save fails are part of the failed batch", async () => {
    const first = deferred();
    const send = vi
      .fn<(patch: AppearancePatch) => Promise<SaveOutcome>>()
      .mockReturnValueOnce(first.promise);
    const { queue, onFailed } = setup(send);

    void queue.enqueue({ mode_preference: "dark" });
    void queue.enqueue({ undiscovered_enabled: false });
    first.resolve({ ok: false });
    await vi.waitFor(() => expect(onFailed).toHaveBeenCalled());
    expect(onFailed).toHaveBeenCalledWith({
      mode_preference: "dark",
      undiscovered_enabled: false
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown request as a failure", async () => {
    const send = vi
      .fn<(patch: AppearancePatch) => Promise<SaveOutcome>>()
      .mockRejectedValueOnce(new Error("offline"));
    const { queue, onFailed } = setup(send);
    await queue.enqueue({ mode_preference: "dark" });
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(queue.state().failed).toEqual({ mode_preference: "dark" });
  });

  it("Retry sends the failed change again and clears the failure on success", async () => {
    const send = vi
      .fn<(patch: AppearancePatch) => Promise<SaveOutcome>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, saved: SAVED });
    const { queue, onSaved } = setup(send);

    await queue.enqueue({ brand_preference: "noir" });
    await queue.retry();
    expect(send).toHaveBeenLastCalledWith({ brand_preference: "noir" });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(queue.state().failed).toBeNull();
  });

  it("a new change after a failure dismisses it", async () => {
    const send = vi
      .fn<(patch: AppearancePatch) => Promise<SaveOutcome>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, saved: SAVED });
    const { queue } = setup(send);
    await queue.enqueue({ mode_preference: "dark" });
    await queue.enqueue({ single_mode_policy: "exclude" });
    expect(send).toHaveBeenLastCalledWith({ single_mode_policy: "exclude" });
    expect(queue.state().failed).toBeNull();
  });

  it("Retry with nothing failed does nothing", async () => {
    const send = vi.fn<(patch: AppearancePatch) => Promise<SaveOutcome>>();
    const { queue } = setup(send);
    await queue.retry();
    expect(send).not.toHaveBeenCalled();
  });
});
