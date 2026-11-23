import type { WaiverWindow } from "../../domain/waiverWindows.js";

/*
 * Delivery of Circuit status and schedule changes, on the pattern of
 * circuitScoreEvents: the entry point registers the /circuits namespace's
 * emitter here, and the admin services call the emit functions once a change
 * has committed. Safe to call when nothing is registered (realtime off, tests
 * without a socket server).
 */

/** A `schedule:update` message: a date or an association changed. */
export type CircuitScheduleUpdateMessage = {
  circuit_league_id: number;
  circuit_id: number;
  /** What changed, e.g. `update_ceremony_dates`. */
  reason: string;
  /** Ceremonies the change names; empty when it concerns the whole Circuit. */
  ceremony_ids: number[];
  /** The league's add/drop windows re-derived from the current dates. */
  waiver_windows: WaiverWindow[];
  /** Server clock at emit time. */
  server_time: string;
};

/** A `circuit:status` message: the Circuit moved along its lifecycle. */
export type CircuitStatusMessage = {
  circuit_league_id: number;
  circuit_id: number;
  status: string;
  /** Server clock at emit time. */
  server_time: string;
};

export type CircuitAdminEvent =
  | { event: "schedule:update"; message: CircuitScheduleUpdateMessage }
  | { event: "circuit:status"; message: CircuitStatusMessage };

type Emitter = (event: CircuitAdminEvent) => void;

let emitter: Emitter | null = null;

export function registerCircuitScheduleEventEmitter(fn: Emitter | null): void {
  emitter = fn;
}

export function hasCircuitScheduleEventEmitter(): boolean {
  return emitter !== null;
}

export function emitCircuitScheduleUpdate(
  message: Omit<CircuitScheduleUpdateMessage, "server_time">
): void {
  emitter?.({
    event: "schedule:update",
    message: { ...message, server_time: new Date().toISOString() }
  });
}

export function emitCircuitStatus(
  message: Omit<CircuitStatusMessage, "server_time">
): void {
  emitter?.({
    event: "circuit:status",
    message: { ...message, server_time: new Date().toISOString() }
  });
}
