import { useCallback, useEffect, useRef, useState } from "react";
import { notify } from "../../notifications";
import type { ApiResult, Snapshot } from "../../lib/types";
import { makeRequestId } from "./helpers";
import {
  isPendingPickSettled,
  type PendingPick
} from "../../decisions/draft/optimisticPick";
import {
  postDraftPause,
  postDraftPick,
  postDraftResume,
  postDraftStart
} from "./actions";

const PENDING_PICK_RECONCILE_MS = 4000;

/** Pick / start / pause / resume commands with their loading and result state. */
export function useDraftRoomActions(args: {
  snapshot: Snapshot | null;
  selectedNominationId: number | null;
  setSelectedNominationId: (id: number | null) => void;
  loadSnapshot: (options?: { preserveSnapshot?: boolean }) => Promise<boolean>;
  /** Set while the live connection is down; pick submission is refused with this reason. */
  connectionBlockedReason?: string | null;
}) {
  const {
    snapshot,
    selectedNominationId,
    setSelectedNominationId,
    loadSnapshot,
    connectionBlockedReason
  } = args;

  // The pick the user just submitted, shown optimistically until the snapshot
  // (socket event or refetch) carries it or the server rejects it.
  const [pendingPick, setPendingPick] = useState<PendingPick | null>(null);
  const pendingPickRef = useRef<PendingPick | null>(null);
  useEffect(() => {
    pendingPickRef.current = pendingPick;
  }, [pendingPick]);
  const mountedRef = useRef(true);
  const reconcileTimerRef = useRef<number | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (reconcileTimerRef.current !== null) {
        window.clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (pendingPick && isPendingPickSettled(snapshot, pendingPick)) {
      setPendingPick(null);
    }
  }, [pendingPick, snapshot]);

  const [pickState, setPickState] = useState<ApiResult | null>(null);
  const [pickLoading, setPickLoading] = useState(false);
  const [startState, setStartState] = useState<ApiResult | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [pauseState, setPauseState] = useState<ApiResult | null>(null);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [resumeState, setResumeState] = useState<ApiResult | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);

  const submitPickNomination = useCallback(
    async (nominationId: number) => {
      if (!snapshot) return;
      // One pick in flight at a time; the idempotency key is per submission.
      if (pendingPickRef.current) return;
      if (connectionBlockedReason) {
        setPickState({ ok: false, message: connectionBlockedReason });
        notify({
          id: "draft.pick.failed",
          severity: "error",
          trigger_type: "user_action",
          scope: "local",
          durability: "ephemeral",
          requires_decision: false,
          message: connectionBlockedReason
        });
        return;
      }
      setPickLoading(true);
      setPickState(null);

      const requestId = makeRequestId();
      const seatNumber = snapshot.my_seat_number ?? null;
      const pickNumber = snapshot.draft.current_pick_number ?? null;
      if (seatNumber !== null && typeof pickNumber === "number") {
        const pending: PendingPick = { requestId, nominationId, seatNumber, pickNumber };
        pendingPickRef.current = pending;
        setPendingPick(pending);
      }

      const res = await postDraftPick({
        draftId: snapshot.draft.id,
        nominationId,
        requestId
      });

      if (res.ok) {
        setPickState(null);
        setSelectedNominationId(null);
        // Do not toast here; the websocket "pick made" event is the single source of truth
        // and will toast for all clients (including the picker). The optimistic pick
        // clears itself once the snapshot carries the real one. If that event never
        // arrives, refetch and drop the overlay so the board cannot stay ahead of the server.
        if (reconcileTimerRef.current !== null) {
          window.clearTimeout(reconcileTimerRef.current);
        }
        reconcileTimerRef.current = window.setTimeout(() => {
          reconcileTimerRef.current = null;
          if (pendingPickRef.current?.requestId !== requestId) return;
          void loadSnapshot({ preserveSnapshot: true }).then(() => {
            if (!mountedRef.current) return;
            setPendingPick((cur) => (cur?.requestId === requestId ? null : cur));
          });
        }, PENDING_PICK_RECONCILE_MS);
      } else {
        // Roll back the optimistic pick.
        pendingPickRef.current = null;
        setPendingPick(null);
        const message = res.error ?? "Pick failed";
        setPickState({ ok: false, message });
        notify({
          id: "draft.pick.failed",
          severity: "error",
          trigger_type: "user_action",
          scope: "local",
          durability: "ephemeral",
          requires_decision: false,
          message
        });
      }
      setPickLoading(false);
    },
    [connectionBlockedReason, loadSnapshot, setSelectedNominationId, snapshot]
  );

  const submitPick = useCallback(async () => {
    if (!selectedNominationId) return;
    await submitPickNomination(selectedNominationId);
  }, [selectedNominationId, submitPickNomination]);

  const startDraft = useCallback(async () => {
    if (!snapshot) return;
    setStartLoading(true);
    setStartState(null);
    const res = await postDraftStart(snapshot.draft.id);
    if (res.ok) {
      setStartState(null);
      notify({
        id: "draft.start.ok",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Draft started"
      });
      await loadSnapshot({ preserveSnapshot: true });
    } else {
      const message = res.error ?? "Failed to start draft";
      setStartState({ ok: false, message });
      notify({
        id: "draft.start.failed",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message
      });
    }
    setStartLoading(false);
  }, [loadSnapshot, snapshot]);

  const pauseDraft = useCallback(async () => {
    if (!snapshot) return;
    setPauseLoading(true);
    setPauseState(null);
    const res = await postDraftPause(snapshot.draft.id);
    if (res.ok) {
      setPauseState(null);
      notify({
        id: "draft.pause.ok",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Draft paused"
      });
      await loadSnapshot({ preserveSnapshot: true });
    } else {
      const message = res.error ?? "Failed to pause draft";
      setPauseState({ ok: false, message });
      notify({
        id: "draft.pause.failed",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message
      });
    }
    setPauseLoading(false);
  }, [loadSnapshot, snapshot]);

  const resumeDraft = useCallback(async () => {
    if (!snapshot) return;
    setResumeLoading(true);
    setResumeState(null);
    const res = await postDraftResume(snapshot.draft.id);
    if (res.ok) {
      setResumeState(null);
      notify({
        id: "draft.resume.ok",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Draft resumed"
      });
      await loadSnapshot({ preserveSnapshot: true });
    } else {
      const message = res.error ?? "Failed to resume draft";
      setResumeState({ ok: false, message });
      notify({
        id: "draft.resume.failed",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message
      });
    }
    setResumeLoading(false);
  }, [loadSnapshot, snapshot]);

  return {
    pendingPick,
    header: {
      startLoading,
      startResult: startState,
      onStartDraft: () => void startDraft(),
      pauseLoading,
      pauseResult: pauseState,
      onPauseDraft: () => void pauseDraft(),
      resumeLoading,
      resumeResult: resumeState,
      onResumeDraft: () => void resumeDraft()
    },
    myRoster: {
      pickLoading,
      pickState,
      submitPick: () => void submitPick(),
      submitPickNomination: (nominationId: number) =>
        void submitPickNomination(nominationId)
    }
  };
}
