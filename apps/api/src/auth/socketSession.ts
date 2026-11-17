import type { Socket } from "socket.io";
import { parseCookies } from "./cookie.js";
import { verifyToken } from "./token.js";
import { getActiveSessionUser } from "../data/repositories/authSessionRepository.js";
import { AUTH_SESSION_MAX_AGE_MS } from "../domain/authSession.js";
import type { DbClient } from "../data/db.js";
import { AppError } from "../errors.js";

/**
 * The session credential for a socket handshake. Browsers send the HttpOnly
 * `auth_token` cookie on the same-origin websocket upgrade; that is the only
 * credential the web app uses. Bearer is for non-browser clients (same as
 * HTTP). The `auth` payload is a transition path for tabs opened before the
 * cookie-only change and for the api.fantasy-oscars.com alias; remove it when
 * that alias is retired.
 */
export function parseSocketToken(socket: Socket): string | null {
  const authHeader = socket.handshake.headers?.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  const cookie = parseCookies(socket.handshake.headers?.cookie).auth_token;
  if (cookie) return cookie;
  const authPayload = socket.handshake.auth as
    { token?: unknown; Authorization?: unknown } | undefined;
  const authDraft = authPayload?.token ?? authPayload?.Authorization;
  if (typeof authDraft === "string" && authDraft.startsWith("Bearer "))
    return authDraft.slice("Bearer ".length);
  if (typeof authDraft === "string" && authDraft) return authDraft;
  return null;
}

/**
 * The user behind a socket handshake: a valid token bound to a live session.
 * Shared by every Socket.IO namespace; each namespace adds its own room
 * admission check.
 */
export async function authenticateSocket(
  socket: Socket,
  opts: { db: DbClient; authSecret: string }
): Promise<number> {
  const token = parseSocketToken(socket);
  if (!token) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
  const claims = verifyToken(token, opts.authSecret);
  const userId = Number(claims.sub);
  if (!Number.isInteger(userId) || userId <= 0)
    throw new AppError("UNAUTHORIZED", 401, "Invalid token");
  const session = claims.sid
    ? await getActiveSessionUser(opts.db, {
        sessionId: claims.sid,
        userId,
        maxAgeMs: AUTH_SESSION_MAX_AGE_MS
      })
    : null;
  if (!session) {
    throw new AppError(
      "UNAUTHORIZED",
      401,
      "Your session has expired. Please log in again."
    );
  }
  return userId;
}
