// Decoupled wake signal so drafting code can nudge the sweeper without importing it
// (the sweeper itself depends on drafting services).
type WakeFn = (deadline?: Date | string | null) => void;

let handler: WakeFn | null = null;

export function registerDraftSweeperWake(fn: WakeFn | null): void {
  handler = fn;
}

/**
 * Tell the sweeper a timed draft started, resumed or got a new pick deadline, so it
 * re-arms its timer. Safe to call when the sweeper is disabled or not started.
 * Pass the new deadline when known; without it the sweeper re-checks after its interval.
 */
export function wakeDraftSweeper(deadline?: Date | string | null): void {
  handler?.(deadline);
}
