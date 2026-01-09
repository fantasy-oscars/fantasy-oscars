import type { Namespace, Server, Socket } from "socket.io";

export const DRAFT_NAMESPACE = "/drafts";

export type DraftSocketData = {
  draftId: number;
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

export function registerDraftNamespace(io: Server): Namespace {
  const nsp = io.of(DRAFT_NAMESPACE);

  nsp.use((socket, next) => {
    try {
      const draftId = parseDraftId(socket);
      socket.data = { draftId } satisfies DraftSocketData;
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
