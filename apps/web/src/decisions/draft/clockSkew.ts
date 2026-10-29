/**
 * Pick-deadline timestamps come from the server clock, so a client whose clock is
 * fast or slow would count down to the wrong moment. The server stamps snapshots
 * and draft events with its own time; the offset between that stamp and the local
 * receive time lets the client work out "server now" without trusting its own clock.
 */

/**
 * Estimate (server clock - client clock) in ms from one server-stamped message.
 * When the request send time is known (snapshot fetches), assume the server stamped
 * the response halfway through the round trip; otherwise (socket events) assume the
 * message arrived instantly. Returns null when the stamp is missing or unparseable.
 */
export function estimateServerOffsetMs(args: {
  serverTime: string | null | undefined;
  receivedAtMs: number;
  sentAtMs?: number;
}): number | null {
  const { serverTime, receivedAtMs, sentAtMs } = args;
  if (!serverTime) return null;
  const serverMs = new Date(serverTime).getTime();
  if (!Number.isFinite(serverMs) || !Number.isFinite(receivedAtMs)) return null;
  const clientMidpointMs =
    typeof sentAtMs === "number" && Number.isFinite(sentAtMs) && sentAtMs <= receivedAtMs
      ? (sentAtMs + receivedAtMs) / 2
      : receivedAtMs;
  return serverMs - clientMidpointMs;
}

/** The server's current time, as best the client can tell. */
export function toServerNowMs(clientNowMs: number, offsetMs: number): number {
  return clientNowMs + offsetMs;
}
