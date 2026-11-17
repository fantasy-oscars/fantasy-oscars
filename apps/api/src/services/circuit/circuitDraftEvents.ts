import type { CircuitDraftEventRow } from "../../data/repositories/circuitDraftRepository.js";

/*
 * Delivery of committed Circuit draft events. Circuit modules may not import
 * the realtime modules (ADR 0005, section 10), so the entry point registers
 * the /circuits namespace's emitter here and the Circuit draft calls
 * emitCircuitDraftEvents after each commit. Safe to call when nothing is
 * registered (realtime off, tests without a socket server).
 */

/** A `draft:event` message, sent to the league's room in the /circuits namespace. */
export type CircuitDraftEventMessage = {
  draft_id: number;
  circuit_league_id: number;
  /** The draft's version after this event; consecutive within a draft. */
  version: number;
  event_type: string;
  payload: unknown;
  created_at: string;
  /** Server clock at emit time; lets clients correct for local clock skew. */
  server_time: string;
};

type Emitter = (message: CircuitDraftEventMessage) => void;

let emitter: Emitter | null = null;

export function registerCircuitDraftEventEmitter(fn: Emitter | null): void {
  emitter = fn;
}

/** Sends committed events in version order. */
export function emitCircuitDraftEvents(
  circuitLeagueId: number,
  events: readonly CircuitDraftEventRow[]
): void {
  if (!emitter) return;
  for (const event of events) {
    emitter({
      draft_id: event.draft_id,
      circuit_league_id: circuitLeagueId,
      version: event.version,
      event_type: event.event_type,
      payload: event.payload,
      created_at: event.created_at.toISOString(),
      server_time: new Date().toISOString()
    });
  }
}
