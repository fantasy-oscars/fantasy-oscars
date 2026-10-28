export const CURSOR_MAX_EVENTS_PER_SECOND = 20;

/** Fixed-window limiter for one socket; returns true when the event may be rebroadcast. */
export function createCursorThrottle(
  maxPerSecond = CURSOR_MAX_EVENTS_PER_SECOND,
  now: () => number = Date.now
): () => boolean {
  let windowStart = 0;
  let count = 0;
  return () => {
    const t = now();
    if (t - windowStart >= 1000) {
      windowStart = t;
      count = 0;
    }
    if (count >= maxPerSecond) return false;
    count += 1;
    return true;
  };
}
