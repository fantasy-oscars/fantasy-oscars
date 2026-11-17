import type { Namespace, Server, Socket } from "socket.io";
import { authenticateSocket } from "../auth/socketSession.js";
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

export function registerDraftNamespace(
  io: Server,
  opts: { db: DbClient; authSecret: string }
): Namespace {
  const nsp = io.of(DRAFT_NAMESPACE);

  nsp.use(async (socket, next) => {
    try {
      const draftId = parseDraftId(socket);
      const userId = await authenticateSocket(socket, opts);

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
