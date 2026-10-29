/** Sessions stay valid for 30 days after the last renewal. */
export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Absolute cap: no session outlives `created_at` + 180 days, however often it is renewed. */
export const AUTH_SESSION_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

/** A session is renewed (and its cookie re-issued) at most once per this interval. */
export const AUTH_SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

/** True when the session was last renewed long enough ago to extend it again. */
export function shouldRenewAuthSession(lastSeenAt: Date, now: Date = new Date()) {
  return now.getTime() - lastSeenAt.getTime() > AUTH_SESSION_RENEW_AFTER_MS;
}

/** Seconds until `expiresAt`, floored at 1 so a freshly signed token is never already expired. */
export function secondsUntil(expiresAt: Date, now: Date = new Date()) {
  return Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
