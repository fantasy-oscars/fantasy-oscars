import type { Pool } from "pg";
import { getCircuitLeagueById } from "../../data/repositories/circuitLeagueRepository.js";
import { listCircuitWaiverLeagues } from "../../data/repositories/circuitWaiverRepository.js";
import { instantOfDay, resultsDateOf } from "../../domain/circuit.js";
import { addDays } from "../../domain/waiverWindows.js";
import { log } from "../../logger.js";
import { getCircuitLeagueDueWaiverWindows } from "./circuitOwnership.js";
import {
  processCircuitWaiverWindow,
  type CircuitWaiverRunResult
} from "./circuitWaiverProcessor.js";

/*
 * The waiver scheduler (ADR 0005, section 9), on the draft sweeper's pattern:
 * one process-wide loop that checks under its own advisory lock, so only one
 * instance runs waivers at a time. Each check runs every window whose
 * resolution instant has passed and that has no run, oldest first. Windows
 * are found from the dates, not from the clock of the last check, so a check
 * after downtime catches up on everything missed.
 */

// Chosen constant, distinct from the draft sweeper's; stable across processes.
const WAIVER_SCHEDULER_LOCK_KEY = 923_701_145;

function parseOptionalBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

/** A non-negative whole number of milliseconds; 0 is allowed. */
function parseOptionalMs(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

/**
 * Runs every due window of every drafted league, without the advisory lock
 * (the scheduler and the runbook's re-run take care of that). A failing
 * window is logged and stops that league's later windows until the next
 * check, so a league's windows always run in order.
 */
export async function runDueCircuitWaivers(
  pool: Pool,
  now: Date = new Date()
): Promise<CircuitWaiverRunResult[]> {
  const results: CircuitWaiverRunResult[] = [];
  for (const { circuit_league_id } of await listCircuitWaiverLeagues(pool)) {
    try {
      const league = await getCircuitLeagueById(pool, circuit_league_id);
      if (!league) continue;
      for (const window of await getCircuitLeagueDueWaiverWindows(pool, league, now)) {
        const result = await processCircuitWaiverWindow(pool, league.id, window);
        if (result) {
          log({ level: "info", msg: "circuit_waiver_run_completed", ...result });
          results.push(result);
        }
      }
    } catch (err) {
      log({
        level: "error",
        msg: "circuit_waiver_run_failed",
        circuit_league_id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return results;
}

/**
 * One scheduler check: takes the advisory lock, runs the due windows and
 * releases it. Returns null when another instance holds the lock.
 */
export async function checkCircuitWaivers(
  pool: Pool,
  now: Date = new Date()
): Promise<CircuitWaiverRunResult[] | null> {
  const client = await pool.connect();
  try {
    const lock = await client.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS ok",
      [WAIVER_SCHEDULER_LOCK_KEY]
    );
    if (!lock.rows[0]?.ok) return null;
    try {
      return await runDueCircuitWaivers(pool, now);
    } finally {
      await client
        .query("SELECT pg_advisory_unlock($1)", [WAIVER_SCHEDULER_LOCK_KEY])
        .catch(() => {});
    }
  } finally {
    client.release();
  }
}

export type CircuitWaiverScheduler = { stop: () => Promise<void> };

/** Just after the next midnight in America/Los_Angeles, when windows resolve. */
export function nextWaiverResolutionCheckAt(now: Date): Date {
  const midnight = instantOfDay(addDays(resultsDateOf(now)!, 1));
  return new Date(midnight.getTime() + 5_000);
}

/**
 * Starts the loop: a check at startup, then one just after each midnight
 * Pacific (windows resolve only then) or after
 * CIRCUIT_WAIVER_SCHEDULER_INTERVAL_MS (default ten minutes), whichever is
 * sooner. The fallback picks up date edits that move a resolution into the
 * past; it matches the draft sweeper's idle poll, so the database is woken no
 * more often than it already is, and 0 turns it off. `onRun` hears about
 * each completed run.
 */
export function startCircuitWaiverScheduler(
  pool: Pool,
  opts: { onRun?: (result: CircuitWaiverRunResult) => void } = {}
): CircuitWaiverScheduler {
  const enabled = parseOptionalBool(process.env.CIRCUIT_WAIVER_SCHEDULER_ENABLED, true);
  if (!enabled) return { stop: async () => {} };
  const intervalMs = parseOptionalMs(
    process.env.CIRCUIT_WAIVER_SCHEDULER_INTERVAL_MS,
    600_000
  );

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> | null = null;

  async function check() {
    try {
      for (const result of (await checkCircuitWaivers(pool)) ?? []) {
        opts.onRun?.(result);
      }
    } catch (err) {
      log({
        level: "error",
        msg: "circuit_waiver_scheduler_failed",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  function schedule(delayMs: number) {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      running = check().finally(() => {
        running = null;
        const now = Date.now();
        const midnight = nextWaiverResolutionCheckAt(new Date(now)).getTime();
        schedule(intervalMs > 0 ? Math.min(midnight - now, intervalMs) : midnight - now);
      });
    }, delayMs);
  }

  schedule(0);
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await running;
    }
  };
}
