/*
 * Delivery of ledger changes, on the pattern of circuitWaiverEvents: the
 * entry point registers the /circuits namespace's emitter here, and the
 * scoring rebuild calls emitCircuitScoreUpdates once its occasions have
 * committed. Safe to call when nothing is registered (realtime off, tests
 * without a socket server).
 */

/** A `score:update` message, sent to the league's room in the /circuits namespace. */
export type CircuitScoreUpdateMessage = {
  circuit_league_id: number;
  /** Ceremonies whose ledger rows were rebuilt, ascending. */
  ceremony_ids: number[];
  /** Server clock at emit time. */
  server_time: string;
};

type Emitter = (message: CircuitScoreUpdateMessage) => void;

let emitter: Emitter | null = null;

export function registerCircuitScoreEventEmitter(fn: Emitter | null): void {
  emitter = fn;
}

/** Tells each league with a changed ceremony to reload its standings. */
export function emitCircuitScoreUpdates(
  changes: readonly { circuit_league_id: number; ceremony_id: number }[]
): void {
  if (!emitter) return;
  const byLeague = new Map<number, Set<number>>();
  for (const c of changes) {
    const ceremonies = byLeague.get(c.circuit_league_id) ?? new Set<number>();
    ceremonies.add(c.ceremony_id);
    byLeague.set(c.circuit_league_id, ceremonies);
  }
  const server_time = new Date().toISOString();
  for (const [circuit_league_id, ceremonies] of byLeague) {
    emitter({
      circuit_league_id,
      ceremony_ids: [...ceremonies].sort((a, b) => a - b),
      server_time
    });
  }
}
