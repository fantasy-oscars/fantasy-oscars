export const COUNTDOWN_WINDOW_MS = 5000;
export const COUNTDOWN_BEEP_INTERVAL_MS = 700;

export function isCountdownActive(timerRemainingMs: number | null) {
  return (
    typeof timerRemainingMs === "number" &&
    Number.isFinite(timerRemainingMs) &&
    timerRemainingMs > 0 &&
    timerRemainingMs <= COUNTDOWN_WINDOW_MS
  );
}

/** Words shown in the countdown window, e.g. "4s left". Whole seconds, rounded up. */
export function formatCountdownText(timerRemainingMs: number) {
  return `${Math.max(1, Math.ceil(timerRemainingMs / 1000))}s left`;
}
