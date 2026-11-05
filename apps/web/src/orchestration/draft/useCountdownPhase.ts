import { useEffect, useRef, useState } from "react";
import { playCountdownBeep, type createDraftAudioController } from "../../lib/draftAudio";
import { COUNTDOWN_BEEP_INTERVAL_MS } from "../../decisions/draft/countdown";

export type CountdownPhase = "gold" | "red" | null;

/**
 * Alternates the pick-timer urgency phase while the countdown is active, in step with
 * the beeps. The first tick lands synchronously, so the first phase is "red". The phase
 * is a colour pulse only: the words, glyph and ring that carry the state never change.
 * Under reduced motion the alternation stops and the danger phase is held.
 */
export function useCountdownPhase(args: {
  active: boolean;
  canBeep: boolean;
  audioController: ReturnType<typeof createDraftAudioController>;
}): CountdownPhase {
  const { active, canBeep, audioController } = args;
  const [phase, setPhase] = useState<CountdownPhase>(null);
  const intervalRef = useRef<number | null>(null);
  const canBeepRef = useRef(canBeep);
  const audioControllerRef = useRef(audioController);

  useEffect(() => {
    canBeepRef.current = canBeep;
    audioControllerRef.current = audioController;
  }, [canBeep, audioController]);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setPhase(null);
      return;
    }

    const tick = () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setPhase((prev) => (reduceMotion || prev !== "red" ? "red" : "gold"));
      if (canBeepRef.current) playCountdownBeep(audioControllerRef.current);
    };

    tick();
    intervalRef.current = window.setInterval(tick, COUNTDOWN_BEEP_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active]);

  return phase;
}
