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
