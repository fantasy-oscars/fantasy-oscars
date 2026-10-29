import type { Pool } from "pg";

import { log } from "../logger.js";
import { tickDraft } from "./drafting/tick.js";
import { registerDraftSweeperWake } from "./draftSweeperWake.js";

export { wakeDraftSweeper } from "./draftSweeperWake.js";

function parseOptionalBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseOptionalInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

// Single-worker guard for multi-instance deployments.
// Chosen constant; must be stable across processes.
const SWEEPER_LOCK_KEY = 923_701_144;

/** Upper bound on how long the sweeper sleeps while timed drafts are in progress. */
const MAX_SLEEP_MS = 30_000;

export type DraftSweeper = {
  stop: () => Promise<void>;
  wake: (deadline?: Date | string | null) => void;
};

/**
 * Deadline-driven sweeper. It issues no queries while no timed draft is IN_PROGRESS:
 * after each check it sleeps until the earliest pick deadline (clamped between the
 * configured interval and 30s) or goes idle until `wakeDraftSweeper` is called.
 */
export function startDraftSweeper(pool: Pool): DraftSweeper {
  const enabled = parseOptionalBool(process.env.DRAFT_SWEEPER_ENABLED, true);
  if (!enabled) return { stop: async () => {}, wake: () => {} };

  const intervalMs = parseOptionalInt(process.env.DRAFT_SWEEPER_INTERVAL_MS, 1000);
  const batchSize = parseOptionalInt(process.env.DRAFT_SWEEPER_BATCH_SIZE, 25);
  // Fallback poll while idle, to pick up timed drafts advanced by another instance
  // (e.g. during a deploy overlap). 0 disables it.
  const idlePollRaw = process.env.DRAFT_SWEEPER_IDLE_POLL_MS?.trim();
  const idlePollParsed =
    idlePollRaw === undefined || idlePollRaw === "" ? NaN : Number(idlePollRaw);
  const idlePollMs =
    Number.isFinite(idlePollParsed) && idlePollParsed >= 0
      ? Math.floor(idlePollParsed)
      : 600_000;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let timerAt = Infinity;
  let running: Promise<void> | null = null;
  // Earliest wake requested while a check was running; merged once it finishes.
  let pendingAt = Infinity;
  // Next check time decided by the check that just ran.
  let nextAfterCheck = Infinity;

  function scheduleAt(at: number) {
    if (stopped) return;
    if (running) {
      pendingAt = Math.min(pendingAt, at);
      return;
    }
    if (timer && timerAt <= at) return;
    if (timer) clearTimeout(timer);
    timerAt = at;
    timer = setTimeout(
      () => {
        timer = null;
        timerAt = Infinity;
        running = check().finally(() => {
          running = null;
          const next = Math.min(nextAfterCheck, pendingAt);
          pendingAt = Infinity;
          if (next !== Infinity) scheduleAt(next);
        });
      },
      Math.max(0, at - Date.now())
    );
  }

  async function check(): Promise<void> {
    nextAfterCheck = Infinity;
    let client;
    try {
      client = await pool.connect();
      const lockRes = await client.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS ok",
        [SWEEPER_LOCK_KEY]
      );
      if (!lockRes.rows[0]?.ok) {
        // Another instance is sweeping right now; look again shortly.
        nextAfterCheck = Date.now() + intervalMs;
        return;
      }

      // Find drafts whose timers have expired. We don't attempt to infer "should pick" here;
      // `tickDraft` will do the correct locking and verification.
      const expired = await client.query<{ id: number }>(
        `
          SELECT id
          FROM draft
          WHERE status = 'IN_PROGRESS'
            AND pick_timer_seconds IS NOT NULL
            AND pick_timer_seconds > 0
            AND pick_deadline_at IS NOT NULL
            AND pick_deadline_at < NOW()
          ORDER BY pick_deadline_at ASC
          LIMIT $1
        `,
        [batchSize]
      );

      for (const row of expired.rows) {
        try {
          await tickDraft(pool, row.id);
        } catch (err) {
          log({
            level: "error",
            msg: "draft_sweeper_tick_failed",
            draft_id: row.id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }

      // Sleep until the earliest remaining deadline; stay idle when there is none.
      const upcoming = await client.query<{ wait_ms: string | number | null }>(
        `
          SELECT (EXTRACT(EPOCH FROM (MIN(pick_deadline_at) - NOW())) * 1000) AS wait_ms
          FROM draft
          WHERE status = 'IN_PROGRESS'
            AND pick_timer_seconds IS NOT NULL
            AND pick_timer_seconds > 0
            AND pick_deadline_at IS NOT NULL
        `
      );
      const raw = upcoming.rows[0]?.wait_ms;
      if (raw !== null && raw !== undefined) {
        const waitMs = Math.min(Math.max(Number(raw), intervalMs), MAX_SLEEP_MS);
        nextAfterCheck = Date.now() + waitMs;
      } else if (idlePollMs > 0) {
        nextAfterCheck = Date.now() + idlePollMs;
      }
    } catch (err) {
      log({
        level: "error",
        msg: "draft_sweeper_failed",
        error: err instanceof Error ? err.message : String(err)
      });
      // Transient failure: retry rather than go silently idle.
      nextAfterCheck = Date.now() + Math.max(intervalMs, 5000);
    } finally {
      try {
        if (client) {
          // Best-effort release; lock is connection-scoped and will be released on disconnect.
          await client
            .query("SELECT pg_advisory_unlock($1)", [SWEEPER_LOCK_KEY])
            .catch(() => {});
          client.release();
        }
      } catch {
        // ignore
      }
    }
  }

  const sweeper: DraftSweeper = {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      timerAt = Infinity;
      registerDraftSweeperWake(null);
      await running;
    },
    wake: (deadline) => {
      const parsed = deadline ? new Date(deadline).getTime() : NaN;
      const at = Number.isFinite(parsed)
        ? Math.max(parsed, Date.now())
        : Date.now() + intervalMs;
      scheduleAt(at);
    }
  };

  registerDraftSweeperWake(sweeper.wake);
  // Initial check on startup.
  scheduleAt(Date.now());
  return sweeper;
}
