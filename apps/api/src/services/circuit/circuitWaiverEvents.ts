import type { CircuitWaiverRunResult } from "./circuitWaiverProcessor.js";

/*
 * Delivery of completed waiver runs, on the pattern of circuitDraftEvents:
 * the entry point registers the /circuits namespace's emitter here, and the
 * processor calls emitCircuitWaiverResult after a run commits. Safe to call
 * when nothing is registered (realtime off, tests without a socket server).
 */

/** A `waiver:result` message, sent to the league's room in the /circuits namespace. */
export type CircuitWaiverResultMessage = CircuitWaiverRunResult & {
  /** Server clock at emit time. */
  server_time: string;
};

type Emitter = (message: CircuitWaiverResultMessage) => void;

let emitter: Emitter | null = null;

export function registerCircuitWaiverEventEmitter(fn: Emitter | null): void {
  emitter = fn;
}

/** Tells the league a run has completed, so members reload its results. */
export function emitCircuitWaiverResult(result: CircuitWaiverRunResult): void {
  emitter?.({ ...result, server_time: new Date().toISOString() });
}
