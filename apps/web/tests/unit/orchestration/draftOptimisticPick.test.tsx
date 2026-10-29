import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@/lib/types";
import { applyPendingPick, type PendingPick } from "@/decisions/draft/optimisticPick";
import { buildDraftedSet } from "@/decisions/draft";
import { useDraftRoomActions } from "@/orchestration/draft/useDraftRoomActions";

const postDraftPick = vi.fn();
vi.mock("@/orchestration/draft/actions", () => ({
  postDraftPick: (args: unknown) => postDraftPick(args),
  postDraftStart: vi.fn(),
  postDraftPause: vi.fn(),
  postDraftResume: vi.fn()
}));

const notifyMock = vi.fn();
vi.mock("@/notifications", () => ({ notify: (n: unknown) => notifyMock(n) }));

function snapshotWith(picks: Snapshot["picks"], currentPick: number): Snapshot {
  return {
    draft: { id: 9, status: "IN_PROGRESS", current_pick_number: currentPick },
    seats: [
      { seat_number: 1, league_member_id: 1 },
      { seat_number: 2, league_member_id: 2 }
    ],
    picks,
    version: picks.length,
    my_seat_number: 1
  } as unknown as Snapshot;
}

const pending: PendingPick = {
  requestId: "req-1",
  nominationId: 50,
  seatNumber: 1,
  pickNumber: 1
};

describe("applyPendingPick", () => {
  it("adds the pending pick on top of the snapshot without mutating it", () => {
    const base = snapshotWith([], 1);
    const shown = applyPendingPick(base, pending);
    expect(shown?.picks).toEqual([{ pick_number: 1, seat_number: 1, nomination_id: 50 }]);
    expect(base.picks).toEqual([]);
    expect(buildDraftedSet(shown?.picks ?? []).has(50)).toBe(true);
  });

  it("does not duplicate once the real pick has landed", () => {
    const landed = snapshotWith(
      [{ pick_number: 1, seat_number: 1, nomination_id: 50 }],
      2
    );
    const shown = applyPendingPick(landed, pending);
    expect(shown).toBe(landed);
    expect(shown?.picks).toHaveLength(1);
  });

  it("steps aside when someone else (or the timer) took the slot", () => {
    const taken = snapshotWith(
      [{ pick_number: 1, seat_number: 1, nomination_id: 77 }],
      2
    );
    expect(applyPendingPick(taken, pending)?.picks).toEqual(taken.picks);
  });

  it("passes through when nothing is pending", () => {
    const base = snapshotWith([], 1);
    expect(applyPendingPick(base, null)).toBe(base);
    expect(applyPendingPick(null, pending)).toBeNull();
  });
});

describe("useDraftRoomActions optimistic pick", () => {
  beforeEach(() => {
    postDraftPick.mockReset();
    notifyMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(initial: Snapshot, connectionBlockedReason: string | null = null) {
    const loadSnapshot = vi.fn().mockResolvedValue(true);
    const setSelectedNominationId = vi.fn();
    const hook = renderHook(
      (props: { snapshot: Snapshot }) =>
        useDraftRoomActions({
          snapshot: props.snapshot,
          selectedNominationId: 50,
          setSelectedNominationId,
          loadSnapshot,
          connectionBlockedReason
        }),
      { initialProps: { snapshot: initial } }
    );
    return { ...hook, loadSnapshot, setSelectedNominationId };
  }

  it("shows the pick as pending, keeps it single when the server event lands, and clears", async () => {
    let resolvePost: (v: { ok: boolean }) => void = () => {};
    postDraftPick.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      })
    );
    const base = snapshotWith([], 1);
    const { result, rerender } = setup(base);

    act(() => result.current.myRoster.submitPickNomination(50));

    // Pending immediately, before the server answers.
    expect(result.current.pendingPick).toMatchObject({
      nominationId: 50,
      seatNumber: 1,
      pickNumber: 1
    });
    expect(applyPendingPick(base, result.current.pendingPick)?.picks).toHaveLength(1);
    expect(postDraftPick).toHaveBeenCalledTimes(1);
    expect(postDraftPick.mock.calls[0][0]).toMatchObject({
      draftId: 9,
      nominationId: 50,
      requestId: result.current.pendingPick?.requestId
    });

    // A second submit while one is in flight is ignored (no duplicate request).
    act(() => result.current.myRoster.submitPickNomination(51));
    expect(postDraftPick).toHaveBeenCalledTimes(1);

    // The socket event for the same pick arrives before the HTTP response.
    const landed = snapshotWith(
      [{ pick_number: 1, seat_number: 1, nomination_id: 50 }],
      2
    );
    rerender({ snapshot: landed });
    await waitFor(() => expect(result.current.pendingPick).toBeNull());
    expect(applyPendingPick(landed, result.current.pendingPick)?.picks).toHaveLength(1);

    await act(async () => {
      resolvePost({ ok: true });
    });
    expect(result.current.myRoster.pickState).toBeNull();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("rolls back and notifies when the server rejects the pick", async () => {
    postDraftPick.mockResolvedValue({ ok: false, error: "Not your turn" });
    const base = snapshotWith([], 1);
    const { result } = setup(base);

    await act(async () => {
      result.current.myRoster.submitPickNomination(50);
    });

    expect(result.current.pendingPick).toBeNull();
    expect(applyPendingPick(base, result.current.pendingPick)?.picks).toEqual([]);
    expect(result.current.myRoster.pickState).toEqual({
      ok: false,
      message: "Not your turn"
    });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "draft.pick.failed",
        severity: "error",
        message: "Not your turn"
      })
    );
  });

  it("refetches and drops the overlay if the confirming event never arrives", async () => {
    vi.useFakeTimers();
    postDraftPick.mockResolvedValue({ ok: true });
    const { result, loadSnapshot } = setup(snapshotWith([], 1));

    await act(async () => {
      result.current.myRoster.submitPickNomination(50);
    });
    expect(result.current.pendingPick).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(loadSnapshot).toHaveBeenCalledWith({ preserveSnapshot: true });
    expect(result.current.pendingPick).toBeNull();
  });

  it("refuses to submit while disconnected, with the reason", async () => {
    const { result } = setup(snapshotWith([], 1), "Disconnected from the draft.");

    await act(async () => {
      result.current.myRoster.submitPickNomination(50);
    });

    expect(postDraftPick).not.toHaveBeenCalled();
    expect(result.current.pendingPick).toBeNull();
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Disconnected from the draft." })
    );
  });
});
