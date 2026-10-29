type Env = { VITE_API_BASE?: string };

/**
 * Where the API lives. Either an absolute origin ("https://api.example.com",
 * cross-origin deployment) or a root-relative path ("/api", same-origin
 * deployment behind a reverse proxy that strips the prefix). Empty means the
 * API is served from the web origin root.
 */
export function normalizeApiBase(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/\/+$/, "");
}

export function isRelativeApiBase(base: string): boolean {
  return base.startsWith("/") && !base.startsWith("//");
}

export function buildApiUrl(base: string, path: string): string {
  return `${base}${path}`;
}

export type SocketTarget = {
  /** Full namespace URL passed to `io()`. */
  url: string;
  /** Engine path override; omitted when the server default (/socket.io) applies. */
  path?: string;
};

export function buildSocketTarget(
  base: string,
  namespace: string,
  origin: string
): SocketTarget {
  if (isRelativeApiBase(base)) {
    return { url: `${origin}${namespace}`, path: `${base}/socket.io` };
  }
  const socketOrigin = base ? new URL(base, origin).origin : origin;
  return { url: `${socketOrigin}${namespace}` };
}

export const API_BASE = normalizeApiBase(
  (import.meta as unknown as { env: Env }).env.VITE_API_BASE
);
