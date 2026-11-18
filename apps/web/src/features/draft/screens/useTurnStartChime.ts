import { useEffect, useRef, type RefObject } from "react";
import { playTurnStartChime, type createDraftAudioController } from "@/lib/draftAudio";

/**
 * Turn-start chime: plays on "turn ownership" transitions (the seat on the
 * clock flips to the viewer's), not on click or draft actions. This naturally
 * suppresses snake double-picks because `isMyTurn` stays true across the
 * back-to-back pick. Shared by the ceremony and season draft rooms.
 */
export function useTurnStartChime(input: {
  /** Nothing plays (a preview). */
  disabled?: boolean;
  /** The draft is running (not before it, paused or after it). */
  running: boolean;
  isMyTurn: boolean;
  soundEnabled: boolean;
  audioUnlocked: boolean;
  audioControllerRef: RefObject<ReturnType<typeof createDraftAudioController> | null>;
}) {
  const { disabled, running, isMyTurn, soundEnabled, audioUnlocked, audioControllerRef } =
    input;
  const prevIsMyTurnRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (disabled) return;
    if (!running) {
      prevIsMyTurnRef.current = isMyTurn;
      return;
    }
    const prev = prevIsMyTurnRef.current;
    if (soundEnabled && audioUnlocked && prev !== null && !prev && isMyTurn) {
      playTurnStartChime(audioControllerRef.current);
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [audioControllerRef, audioUnlocked, disabled, isMyTurn, running, soundEnabled]);
}
