import type { IncomingMessage } from "http";

/**
 * Engine.io `allowRequest` factory. Socket.IO's `cors` option only covers the HTTP
 * handshake, so WebSocket upgrades must be checked here: browsers always send Origin on
 * upgrades and auto-attach cookies, so a present-but-unlisted Origin is refused.
 * Requests without an Origin header (non-browser clients) are allowed.
 */
export function createAllowRequest(allowedOrigins: string[]) {
  return (
    req: IncomingMessage,
    callback: (err: string | null | undefined, success: boolean) => void
  ) => {
    const origin = req.headers.origin;
    if (origin === undefined || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback("Origin not allowed", false);
  };
}
