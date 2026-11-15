import { useEffect, useState } from "react";
import {
  hasPodiumTie,
  podiumSignature,
  type PodiumCell
} from "../../decisions/draft/podium";

export const PODIUM_CYCLE_INTERVAL_MS = 1500;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Steps through the names of tied podium places, one step every 1.5 s. The step
 * restarts at zero whenever the podium changes. `animate` is false under reduced
 * motion, where the name swaps with no roll.
 */
export function usePodiumCycle(podium: PodiumCell[]): { tick: number; animate: boolean } {
  const signature = podiumSignature(podium);
  const tied = hasPodiumTie(podium);
  const [state, setState] = useState({ signature, tick: 0 });

  useEffect(() => {
    if (!tied) return;
    const interval = window.setInterval(() => {
      setState((prev) =>
        prev.signature === signature
          ? { signature, tick: prev.tick + 1 }
          : { signature, tick: 1 }
      );
    }, PODIUM_CYCLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [tied, signature]);

  return {
    tick: state.signature === signature ? state.tick : 0,
    animate: tied && !prefersReducedMotion()
  };
}
