import type { Namespace, Server, Socket } from "socket.io";
import { parseCookies } from "../auth/cookie.js";
import { verifyToken } from "../auth/token.js";
import { getActiveSessionUser } from "../data/repositories/authSessionRepository.js";
import { AUTH_SESSION_MAX_AGE_MS } from "../domain/authSession.js";
import { getDraftById } from "../data/repositories/draftRepository.js";
import { getLeagueMember } from "../data/repositories/leagueRepository.js";
import { getSeasonMember } from "../data/repositories/seasonMemberRepository.js";
import type { DbClient } from "../data/db.js";
import { AppError } from "../errors.js";
import { createCursorThrottle } from "./cursorThrottle.js";

export const DRAFT_NAMESPACE = "/drafts";

export type DraftSocketData = {
  draftId: number;
  userId: number;
};

const draftRoom = (draftId: number) => `draft:${draftId}`;

function parseDraftId(socket: Socket): number {
  const raw =
    (socket.handshake.query?.draftId as string | string[] | undefined) ??
    (socket.handshake.auth as { draftId?: unknown } | undefined)?.draftId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const num = Number(value);
  if (!value || Number.isNaN(num) || num <= 0) {
    throw new Error("INVALID_DRAFT_ID");
  }
  return num;
}

/**
 * The session credential for a socket handshake. Browsers send the HttpOnly
 * `auth_token` cookie on the same-origin websocket upgrade; that is the only
 * credential the web app uses. Bearer is for non-browser clients (same as
 * HTTP). The `auth` payload is a transition path for tabs opened before the
 * cookie-only change and for the api.fantasy-oscars.com alias; remove it when
 * that alias is retired.
 */
function parseToken(socket: Socket): string | null {
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

export function registerDraftNamespace(
  io: Server,
  opts: { db: DbClient; authSecret: string }
): Namespace {
  const nsp = io.of(DRAFT_NAMESPACE);

  nsp.use(async (socket, next) => {
    try {
      const draftId = parseDraftId(socket);
      const token = parseToken(socket);
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

      const draft = await getDraftById(opts.db, draftId);
      if (!draft) throw new AppError("DRAFT_NOT_FOUND", 404, "Draft not found");

      const leagueMember = await getLeagueMember(opts.db, draft.league_id, userId);
      if (!leagueMember) throw new AppError("FORBIDDEN", 403, "Not a league member");

      const seasonMember = await getSeasonMember(opts.db, draft.season_id, userId);
      if (!seasonMember) {
        throw new AppError("FORBIDDEN", 403, "Not a season participant");
      }

      socket.data = { draftId, userId } satisfies DraftSocketData;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  nsp.on("connection", (socket) => {
    const draftId = (socket.data as DraftSocketData).draftId;
    const userId = (socket.data as DraftSocketData).userId;
    const room = draftRoom(draftId);
    socket.join(room);
    socket.emit("joined", { draftId });

    const allowCursor = createCursorThrottle();
    socket.on("draft:cursor", (payload: unknown) => {
      if (!allowCursor()) return;
      if (!payload || typeof payload !== "object") return;
      const raw = payload as { x?: unknown; y?: unknown };
      const x = Number(raw.x);
      const y = Number(raw.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const nx = Math.max(0, Math.min(1, x));
      const ny = Math.max(0, Math.min(1, y));
      emitToDraft(nsp, draftId, "draft:cursor", {
        draft_id: draftId,
        user_id: userId,
        x: nx,
        y: ny,
        ts: Date.now()
      });
    });
  });

  return nsp;
}

export function emitToDraft(
  nsp: Namespace,
  draftId: number,
  event: string,
  payload: unknown
) {
  nsp.to(draftRoom(draftId)).emit(event, payload);
}

export function getDraftRoom(draftId: number) {
  return draftRoom(draftId);
}
