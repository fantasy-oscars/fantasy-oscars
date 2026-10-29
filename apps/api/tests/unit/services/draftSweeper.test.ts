import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

const mocks = vi.hoisted(() => ({ tickDraft: vi.fn(async () => {}) }));
vi.mock("../../../src/services/drafting/tick.js", () => ({
  tickDraft: mocks.tickDraft
}));

import {
  startDraftSweeper,
  wakeDraftSweeper
} from "../../../src/services/draftSweeper.js";

type Fake = { expired: number[]; waitMs: number | null };

function makePool(state: Fake) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ ok: true }] };
      if (sql.includes("MIN(pick_deadline_at)"))
        return { rows: [{ wait_ms: state.waitMs }] };
      if (sql.includes("pick_deadline_at < NOW()")) {
        const ids = state.expired.splice(0);
        return { rows: ids.map((id) => ({ id })) };
      }
      return { rows: [] };
    }),
    release: vi.fn()
  };
  const connect = vi.fn(async () => client);
  const pool = { connect } as unknown as Pool;
  return { pool, client, connect };
}

const saved = { ...process.env };
beforeEach(() => {
  vi.useFakeTimers();
  mocks.tickDraft.mockClear();
  process.env.DRAFT_SWEEPER_ENABLED = "true";
  process.env.DRAFT_SWEEPER_INTERVAL_MS = "1000";
  process.env.DRAFT_SWEEPER_IDLE_POLL_MS = "0";
});
afterEach(() => {
  vi.useRealTimers();
  process.env = { ...saved };
});

describe("draft sweeper", () => {
  it("issues one check at start, then no queries while no timed draft is in progress", async () => {
    const { pool, client, connect } = makePool({ expired: [], waitMs: null });
    const sweeper = startDraftSweeper(pool);
    await vi.advanceTimersByTimeAsync(10);
    const afterStart = client.query.mock.calls.length;
    expect(afterStart).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(client.query.mock.calls.length).toBe(afterStart);
    expect(connect).toHaveBeenCalledTimes(1);
    await sweeper.stop();
  });

  it("processes a timed draft's expiry after a wake", async () => {
    const state: Fake = { expired: [], waitMs: null };
    const { pool, client } = makePool(state);
    const sweeper = startDraftSweeper(pool);
    await vi.advanceTimersByTimeAsync(10);
    const idleQueries = client.query.mock.calls.length;

    // A pick sets a deadline 5s out.
    wakeDraftSweeper(new Date(Date.now() + 5000));
    await vi.advanceTimersByTimeAsync(4000);
    expect(client.query.mock.calls.length).toBe(idleQueries);

    state.expired = [42];
    await vi.advanceTimersByTimeAsync(1100);
    expect(mocks.tickDraft).toHaveBeenCalledWith(pool, 42);

    // Back to idle once nothing remains.
    await vi.advanceTimersByTimeAsync(60_000);
    const settled = client.query.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(client.query.mock.calls.length).toBe(settled);
    await sweeper.stop();
  });

  it("keeps checking, bounded to 30s, while a deadline remains", async () => {
    const { pool, connect } = makePool({ expired: [], waitMs: 3_600_000 });
    const sweeper = startDraftSweeper(pool);
    await vi.advanceTimersByTimeAsync(10);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_100);
    expect(connect).toHaveBeenCalledTimes(2);
    await sweeper.stop();
  });

  it("polls once per idle-poll interval while idle, and picks up drafts it missed", async () => {
    process.env.DRAFT_SWEEPER_IDLE_POLL_MS = "600000";
    const state: Fake = { expired: [], waitMs: null };
    const { pool, connect } = makePool(state);
    const sweeper = startDraftSweeper(pool);
    await vi.advanceTimersByTimeAsync(10);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(590_000);
    expect(connect).toHaveBeenCalledTimes(1);
    state.expired = [7];
    await vi.advanceTimersByTimeAsync(11_000);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(mocks.tickDraft).toHaveBeenCalledWith(pool, 7);
    await sweeper.stop();
  });

  it("does nothing when disabled, and wake is safe", async () => {
    process.env.DRAFT_SWEEPER_ENABLED = "false";
    const { pool, connect } = makePool({ expired: [], waitMs: null });
    const sweeper = startDraftSweeper(pool);
    wakeDraftSweeper(new Date());
    await vi.advanceTimersByTimeAsync(5000);
    expect(connect).not.toHaveBeenCalled();
    await sweeper.stop();
  });
});
