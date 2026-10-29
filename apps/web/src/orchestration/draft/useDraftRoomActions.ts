import { useCallback, useState } from "react";
import { notify } from "../../notifications";
import type { ApiResult, Snapshot } from "../../lib/types";
import { makeRequestId } from "./helpers";
import {
  postDraftPause,
  postDraftPick,
  postDraftResume,
  postDraftStart
} from "./actions";

/** Pick / start / pause / resume commands with their loading and result state. */
export function useDraftRoomActions(args: {
  snapshot: Snapshot | null;
  selectedNominationId: number | null;
  setSelectedNominationId: (id: number | null) => void;
  loadSnapshot: (options?: { preserveSnapshot?: boolean }) => Promise<boolean>;
}) {
  const { snapshot, selectedNominationId, setSelectedNominationId, loadSnapshot } = args;

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
      setPickLoading(true);
      setPickState(null);

      const res = await postDraftPick({
        draftId: snapshot.draft.id,
        nominationId,
        requestId: makeRequestId()
      });

      if (res.ok) {
        setPickState(null);
        setSelectedNominationId(null);
        // Do not toast here; the websocket "pick made" event is the single source of truth
        // and will toast for all clients (including the picker).
      } else {
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
    [setSelectedNominationId, snapshot]
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
