import { signToken, type TokenClaims } from "../../src/auth/token.js";

/**
 * Deterministic session id for a test user. `insertUser` (factories) creates a
 * live `auth_session` row with this id for every user it inserts, so tests can
 * sign tokens synchronously without logging in.
 */
export function testSessionId(sub: unknown): string {
  return `test-session-${String(sub)}`;
}

/** Signs a token bound to the user's factory-created test session. */
export function signTestToken(
  claims: TokenClaims,
  secret: string,
  expiresInSeconds?: number
) {
  return signToken(
    { sid: testSessionId(claims.sub), ...claims },
    secret,
    expiresInSeconds
  );
}

/**
 * Reads the session token out of a login/register response's `Set-Cookie`
 * header. The API no longer returns the token in the JSON body; non-browser
 * clients that want a Bearer credential take it from the cookie.
 */
export function authTokenFromResponse(headers: Record<string, unknown>): string {
  const raw = headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  for (const cookie of cookies) {
    const match = /^auth_token=([^;]+)/.exec(String(cookie));
    if (match?.[1]) return match[1];
  }
  throw new Error("response did not set an auth_token cookie");
}
