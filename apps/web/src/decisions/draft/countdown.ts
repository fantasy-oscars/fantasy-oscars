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

