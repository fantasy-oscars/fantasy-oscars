import { useCallback, useEffect, useRef, useState } from "react";
import type { CircuitQueueRow } from "@/decisions/circuitDraft";
import { circuitSelectionClearedNote } from "@/decisions/circuitDraftRoom";
import type { CircuitSelectionSummary } from "@/lib/types";
import { useEscapeClearsSelection } from "@/features/draft/screens/useEscapeClearsSelection";
import { useDraftPickConfirmToast } from "@/shared/nominee/useDraftPickConfirmToast";

/**
 * Drafting from the staging lists, as on the ceremony board: a click arms a
 * contender and raises the confirm toast, a double-click (or Shift+Enter, or
 * the toast) drafts it, and Escape, a second click or a click elsewhere
 * disarms. One request at a time: its contender is pending and every other
 * gesture waits for it. A turn change, pause or lost connection clears the
 * arming; a contender drafted before it is confirmed is announced.
 */
export function useStagingGesture(args: {
  /** The viewer is on the clock and connected, and the draft runs. */
  canPick: boolean;
  /** A draft from the form is in flight. */
  picking: boolean;
  draftedIds: ReadonlyMap<number, unknown>;
  onDraft: (selection: CircuitSelectionSummary) => Promise<boolean>;
}) {
  const [armed, setArmedState] = useState<CircuitQueueRow | null>(null);
  // The handlers read the armed row between renders (a click right after a pointerdown).
  const armedRef = useRef<CircuitQueueRow | null>(null);
  const setArmed = useCallback((row: CircuitQueueRow | null) => {
    armedRef.current = row;
    setArmedState(row);
  }, []);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [clearedNote, setClearedNote] = useState<string | null>(null);
  const canDraft = args.canPick && !args.picking && pendingId === null;

  const onDraftRef = useRef(args.onDraft);
  useEffect(() => {
    onDraftRef.current = args.onDraft;
  }, [args.onDraft]);

  const draft = useCallback(
    (row: CircuitQueueRow) => {
      if (!canDraft) return;
      setArmed(null);
      setPendingId(row.selection.id);
      void onDraftRef.current(row.selection).finally(() => setPendingId(null));
    },
    [canDraft, setArmed]
  );

  // The toast's contender: hiding the toast clears the arming before it confirms.
  const toastRowRef = useRef<CircuitQueueRow | null>(null);
  const toast = useDraftPickConfirmToast({
    enabled: canDraft,
    onConfirmPick: (selectionId) => {
      const row = toastRowRef.current;
      if (row && row.selection.id === selectionId) draft(row);
    },
    onClearSelection: () => setArmed(null)
  });
  const { cancelDraftConfirmToast, scheduleDraftConfirmToast } = toast;

  const disarm = useCallback(() => {
    setArmed(null);
    cancelDraftConfirmToast();
  }, [cancelDraftConfirmToast, setArmed]);

  const arm = useCallback(
    (row: CircuitQueueRow) => {
      if (!canDraft) return;
      if (armedRef.current?.selection.id === row.selection.id) {
        disarm();
        return;
      }
      setArmed(row);
      toastRowRef.current = row;
      setClearedNote(null);
      scheduleDraftConfirmToast({ nominationId: row.selection.id, label: row.label });
    },
    [canDraft, disarm, scheduleDraftConfirmToast, setArmed]
  );

  useEffect(() => {
    if (!armed) return;
    if (args.draftedIds.has(armed.selection.id)) {
      setArmed(null);
      setClearedNote(circuitSelectionClearedNote(armed.label));
      return;
    }
    if (!canDraft) setArmed(null);
  }, [armed, canDraft, args.draftedIds, setArmed]);

  useEscapeClearsSelection(armed?.selection.id ?? null, disarm);

  return {
    canDraft,
    armedId: armed?.selection.id ?? null,
    pendingId,
    clearedNote,
    arm,
    disarm,
    draft
  };
}
