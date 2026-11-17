import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

const mocks = vi.hoisted(() => ({ tickDraft: vi.fn(async () => {}) }));
vi.mock("../../../src/services/drafting/tick.js", () => ({
  tickDraft: mocks.tickDraft
}));

import {
  startDraftSweeper,
  type DraftSweeperPass
} from "../../../src/services/draftSweeper.js";

// Extra passes (the Circuit draft's): served in the same check as ceremony
// drafts, under the same advisory lock.
type Fake = {
  locked: boolean;
  ceremonyExpired: number[];
  ceremonyWaitMs: number | null;
  passExpired: number[];
  passWaitMs: number | null;
};

function makePool(state: Fake) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ ok: state.locked }] };
      if (sql.includes("MIN(pick_deadline_at)"))
        return { rows: [{ wait_ms: state.ceremonyWaitMs }] };
      if (sql.includes("pick_deadline_at < NOW()")) {
        const ids = state.ceremonyExpired.splice(0);
        return { rows: ids.map((id) => ({ id })) };
      }
      return { rows: [] };
    }),
    release: vi.fn()
  };
  const connect = vi.fn(async () => client);
  return { pool: { connect } as unknown as Pool, client, connect };
}

function makePass(state: Fake) {
  const tick = vi.fn(async () => null);
  const pass: DraftSweeperPass = {
    name: "test",
    listExpired: vi.fn(async () => state.passExpired.splice(0)),
    tick,
    nextWaitMs: vi.fn(async () => state.passWaitMs)
  };
  return { pass, tick };
}

const fresh = (over: Partial<Fake> = {}): Fake => ({
  locked: true,
  ceremonyExpired: [],
  ceremonyWaitMs: null,
  passExpired: [],
  passWaitMs: null,
  ...over
});

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

describe("draft sweeper passes", () => {
  it("ticks expired drafts of a pass in the same check as ceremony drafts", async () => {
    const state = fresh({ ceremonyExpired: [1], passExpired: [7, 8] });
    const { pool } = makePool(state);
    const { pass, tick } = makePass(state);
    const sweeper = startDraftSweeper(pool, [pass]);
    await vi.advanceTimersByTimeAsync(10);
    expect(mocks.tickDraft).toHaveBeenCalledWith(pool, 1);
    expect(tick.mock.calls).toEqual([
      [pool, 7],
      [pool, 8]
    ]);
    await sweeper.stop();
  });

  it("keeps going when one tick fails", async () => {
    const state = fresh({ passExpired: [7, 8] });
    const { pool } = makePool(state);
    const { pass, tick } = makePass(state);
    tick.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const sweeper = startDraftSweeper(pool, [pass]);
    await vi.advanceTimersByTimeAsync(10);
    expect(tick).toHaveBeenCalledWith(pool, 8);
    await sweeper.stop();
  });

  it("does not run a pass without the advisory lock", async () => {
    const state = fresh({ locked: false, passExpired: [7] });
    const { pool } = makePool(state);
    const { pass, tick } = makePass(state);
    const sweeper = startDraftSweeper(pool, [pass]);
    await vi.advanceTimersByTimeAsync(10);
    expect(pass.listExpired).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
    await sweeper.stop();
  });

  it("wakes for a pass's deadline when no ceremony draft is timed", async () => {
    const state = fresh({ passWaitMs: 5000 });
    const { pool, connect } = makePool(state);
    const { pass, tick } = makePass(state);
    const sweeper = startDraftSweeper(pool, [pass]);
    await vi.advanceTimersByTimeAsync(10);
    expect(connect).toHaveBeenCalledTimes(1);
    state.passWaitMs = null;
    state.passExpired = [9];
    await vi.advanceTimersByTimeAsync(4000);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(tick).toHaveBeenCalledWith(pool, 9);
    await sweeper.stop();
  });

  it("takes the earlier of the ceremony and pass deadlines", async () => {
    const state = fresh({ ceremonyWaitMs: 20_000, passWaitMs: 3000 });
    const { pool, connect } = makePool(state);
    const { pass } = makePass(state);
    const sweeper = startDraftSweeper(pool, [pass]);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(3100);
    expect(connect).toHaveBeenCalledTimes(2);
    await sweeper.stop();
  });
});
