import type { Namespace, Server, Socket } from "socket.io";
import { authenticateSocket } from "../../auth/socketSession.js";
import type { DbClient } from "../../data/db.js";
import { getCircuitLeagueMemberByUser } from "../../data/repositories/circuitOwnershipRepository.js";
import { AppError, validationError } from "../../errors.js";
import { registerCircuitDraftEventEmitter } from "./circuitDraftEvents.js";

/*
 * The /circuits Socket.IO namespace (ADR 0005, section 6). A socket names one
 * Circuit league in its handshake and joins that league's room, after the
 * same session check as the /drafts namespace, only when the user is a member
 * of that Circuit league. The league's draft events go to the room as
 * `draft:event`; later league events (rosters, waivers, scoring) will share
 * it. It lives with the Circuit services because the realtime modules and
 * Circuit modules never import each other; the entry point wires it.
 */

export const CIRCUIT_NAMESPACE = "/circuits";

export type CircuitSocketData = {
  circuitLeagueId: number;
  userId: number;
  memberId: number;
};

const leagueRoom = (circuitLeagueId: number) => `circuit-league:${circuitLeagueId}`;

function parseCircuitLeagueId(socket: Socket): number {
  const raw =
    (socket.handshake.query?.circuitLeagueId as string | string[] | undefined) ??
    (socket.handshake.auth as { circuitLeagueId?: unknown } | undefined)?.circuitLeagueId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const num = Number(value);
  if (!value || !Number.isInteger(num) || num <= 0) {
    throw validationError("Invalid season id", ["circuitLeagueId"]);
  }
  return num;
}

export function registerCircuitNamespace(
  io: Server,
  opts: { db: DbClient; authSecret: string }
): Namespace {
  const nsp = io.of(CIRCUIT_NAMESPACE);

  nsp.use(async (socket, next) => {
    try {
      const circuitLeagueId = parseCircuitLeagueId(socket);
      const userId = await authenticateSocket(socket, opts);
      const member = await getCircuitLeagueMemberByUser(opts.db, circuitLeagueId, userId);
      if (!member) throw new AppError("FORBIDDEN", 403, "Not a member of this season");
      socket.data = {
        circuitLeagueId,
        userId,
        memberId: member.id
      } satisfies CircuitSocketData;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  nsp.on("connection", (socket) => {
    const { circuitLeagueId } = socket.data as CircuitSocketData;
    socket.join(leagueRoom(circuitLeagueId));
    socket.emit("joined", { circuitLeagueId });
  });

  return nsp;
}

export function emitToCircuitLeague(
  nsp: Namespace,
  circuitLeagueId: number,
  event: string,
  payload: unknown
): void {
  nsp.to(leagueRoom(circuitLeagueId)).emit(event, payload);
}

/** Sends committed Circuit draft events to their league's room. */
export function connectCircuitDraftEvents(nsp: Namespace): void {
  registerCircuitDraftEventEmitter((message) =>
    emitToCircuitLeague(nsp, message.circuit_league_id, "draft:event", message)
  );
}

export function disconnectCircuitDraftEvents(): void {
  registerCircuitDraftEventEmitter(null);
}
