import type { Pool } from "pg";
import { getCircuitLeagueById } from "../../data/repositories/circuitLeagueRepository.js";
import {
  listScoringLeaguesForCeremony,
  listScoringLeaguesForCircuit
} from "../../data/repositories/circuitScoreRepository.js";
import { log } from "../../logger.js";
import { getCircuitLeagueWaiverWindows } from "./circuitOwnership.js";
import {
  emitCircuitScheduleUpdate,
  emitCircuitStatus,
  hasCircuitScheduleEventEmitter
} from "./circuitScheduleEvents.js";

/*
 * Tells each affected league's room that the Circuit's schedule or status
 * changed. Called after the write has committed and the scoring rebuild has
 * run, so a failure is logged rather than failing the request: members
 * reload the schedule on their next visit.
 */

export type ScheduleChangeScope =
  { circuitId: number; ceremonyId?: number } | { ceremonyId: number };

/** The leagues of a Circuit, or of every Circuit a ceremony belongs to. */
async function leaguesOf(pool: Pool, scope: ScheduleChangeScope) {
  return "circuitId" in scope
    ? listScoringLeaguesForCircuit(pool, scope.circuitId)
    : listScoringLeaguesForCeremony(pool, scope.ceremonyId);
}

/** Re-derives each league's windows from the current dates and emits `schedule:update`. */
export async function announceScheduleChange(
  pool: Pool,
  scope: ScheduleChangeScope,
  reason: string
): Promise<void> {
  if (!hasCircuitScheduleEventEmitter()) return;
  try {
    const ceremonyIds = scope.ceremonyId === undefined ? [] : [scope.ceremonyId];
    for (const scoring of await leaguesOf(pool, scope)) {
      const league = await getCircuitLeagueById(pool, scoring.id);
      if (!league) continue;
      emitCircuitScheduleUpdate({
        circuit_league_id: league.id,
        circuit_id: league.circuit_id,
        reason,
        ceremony_ids: ceremonyIds,
        waiver_windows: await getCircuitLeagueWaiverWindows(pool, league)
      });
    }
  } catch (err) {
    log({
      level: "error",
      msg: "circuit_schedule_announce_failed",
      reason,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/** Emits `circuit:status` to every league of the Circuit. */
export async function announceCircuitStatus(
  pool: Pool,
  circuitId: number,
  status: string
): Promise<void> {
  if (!hasCircuitScheduleEventEmitter()) return;
  try {
    for (const league of await listScoringLeaguesForCircuit(pool, circuitId)) {
      emitCircuitStatus({
        circuit_league_id: league.id,
        circuit_id: circuitId,
        status
      });
    }
  } catch (err) {
    log({
      level: "error",
      msg: "circuit_status_announce_failed",
      circuit_id: circuitId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
