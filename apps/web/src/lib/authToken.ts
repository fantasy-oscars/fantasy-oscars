const AUTH_TOKEN_KEY = "fo_auth_token";

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(AUTH_TOKEN_KEY);
    const token = typeof raw === "string" ? raw.trim() : "";
    return token ? token : null;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null | undefined) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const next = typeof token === "string" ? token.trim() : "";
    if (!next) {
      storage.removeItem(AUTH_TOKEN_KEY);
      return;
    }
    storage.setItem(AUTH_TOKEN_KEY, next);
  } catch {
    // ignore storage failures (e.g. opaque origin / privacy settings)
  }
}

export function clearAuthToken() {
  setAuthToken(null);
}
