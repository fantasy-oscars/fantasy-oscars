const REVISION_KEY = "fantasyoscars_content_revision";

function safeGetNumber(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function safeSetNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore (private mode / disabled storage)
  }
}

// Used to bust CDN/browser caches for public content endpoints (CMS, banners, etc.)
// without forcing full page reloads.
export function getContentRevision(): number {
  return safeGetNumber(REVISION_KEY);
}

export function bumpContentRevision(): number {
  const next = getContentRevision() + 1;
  safeSetNumber(REVISION_KEY, next);
  return next;
}
