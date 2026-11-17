// A wake signal for the draft sweeper's Circuit pass. Circuit modules may not
// import the sweeper (ADR 0005, section 10), so the entry point registers the
// sweeper's wake here and the Circuit draft calls it after each commit that
// sets a new deadline. Safe to call when nothing is registered.
type WakeFn = (deadline: Date) => void;

let handler: WakeFn | null = null;

export function registerCircuitDraftWake(fn: WakeFn | null): void {
  handler = fn;
}

export function wakeForCircuitDraftDeadline(deadline: Date | null): void {
  if (deadline) handler?.(deadline);
}
