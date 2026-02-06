import type { Pool } from "pg";

import { log } from "../logger.js";
import { tickDraft } from "../routes/drafts.js";

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

export function startDraftSweeper(pool: Pool) {
  const enabled = parseOptionalBool(process.env.DRAFT_SWEEPER_ENABLED, true);
  if (!enabled) return { stop: () => {} };

  const intervalMs = parseOptionalInt(process.env.DRAFT_SWEEPER_INTERVAL_MS, 1000);
  const batchSize = parseOptionalInt(process.env.DRAFT_SWEEPER_BATCH_SIZE, 25);

  const intervalId = setInterval(async () => {
    let client;
    try {
      client = await pool.connect();
      const lockRes = await client.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS ok",
        [SWEEPER_LOCK_KEY]
      );
      if (!lockRes.rows[0]?.ok) return;

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
    } catch (err) {
      log({
        level: "error",
        msg: "draft_sweeper_failed",
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      try {
        if (client) {
          // Best-effort release; lock is connection-scoped and will be released on disconnect.
          await client.query("SELECT pg_advisory_unlock($1)", [SWEEPER_LOCK_KEY]).catch(
            () => {}
          );
          client.release();
        }
      } catch {
        // ignore
      }
    }
  }, intervalMs);

  return {
    stop: () => clearInterval(intervalId)
  };
}

