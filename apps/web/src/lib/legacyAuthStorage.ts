/**
 * Sessions are carried by the HttpOnly cookie only. Earlier builds also kept a
 * bearer token in localStorage; remove it so no credential lingers where script
 * can read it.
 */
const LEGACY_AUTH_TOKEN_KEYS = ["fo_auth_token"];

export function removeLegacyAuthTokens(): void {
  try {
    for (const key of LEGACY_AUTH_TOKEN_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Storage can be blocked (private mode, sandboxed frames); nothing to clean.
  }
}
