import type { Namespace, Server, Socket } from "socket.io";
import { verifyToken } from "../auth/token.js";
import { getDraftById } from "../data/repositories/draftRepository.js";
import { getLeagueMember } from "../data/repositories/leagueRepository.js";
import { getSeasonMember } from "../data/repositories/seasonMemberRepository.js";
import type { DbClient } from "../data/db.js";
import { AppError } from "../errors.js";

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

function parseToken(socket: Socket): string | null {
  const authHeader = socket.handshake.headers?.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  const cookieHeader =
    typeof socket.handshake.headers?.cookie === "string"
      ? socket.handshake.headers.cookie
      : "";
  const cookies = cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [k, ...rest] = part.split("=");
    if (!k) return acc;
    acc[k.trim()] = rest.join("=").trim();
    return acc;
  }, {});
  if (cookies.auth_token) return cookies.auth_token;
  const authDraft =
    (socket.handshake.auth as { token?: unknown } | undefined)?.token ??
    (socket.handshake.auth as { Authorization?: unknown } | undefined)?.Authorization;
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
      if (!Number.isFinite(userId))
        throw new AppError("UNAUTHORIZED", 401, "Invalid token");

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
    const room = draftRoom(draftId);
    socket.join(room);
    socket.emit("joined", { draftId });
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
