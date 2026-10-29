import { describe, expect, it } from "vitest";
import type { Snapshot } from "@/lib/types";
import { estimateServerOffsetMs, toServerNowMs } from "@/decisions/draft/clockSkew";
import { computeTimerRemainingMs } from "@/decisions/draft/scoring";
import { formatTimer } from "@/decisions/draft/pickFeedback";

const MIN = 60_000;
const SERVER_NOW = Date.parse("2026-03-01T20:00:00.000Z");

function liveSnapshot(deadlineMs: number): Snapshot {
  return {
    draft: {
      status: "IN_PROGRESS",
      pick_timer_seconds: 90,
      pick_deadline_at: new Date(deadlineMs).toISOString()
    },
    seats: [],
    picks: []
  } as unknown as Snapshot;
}

/** What a client sees when its clock reads `skewMs` ahead of the server's. */
function remainingOnSkewedClient(skewMs: number, latencyMs = 0) {
  // Server stamps the snapshot at SERVER_NOW; the client's own clock is off by skewMs.
  const clientReceivedAt = SERVER_NOW + skewMs + latencyMs;
  const offset = estimateServerOffsetMs({
    serverTime: new Date(SERVER_NOW).toISOString(),
    receivedAtMs: clientReceivedAt
  });
  expect(offset).not.toBeNull();
  // Ten seconds later by the client's clock.
  const clientNow = clientReceivedAt + 10_000;
  const snapshot = liveSnapshot(SERVER_NOW + 60_000);
  return computeTimerRemainingMs(snapshot, toServerNowMs(clientNow, offset as number));
}

describe("clock skew correction", () => {
  it("shows the true remaining time with an accurate clock", () => {
    expect(remainingOnSkewedClient(0)).toBe(50_000);
  });

  it("is unaffected by a client clock 5 minutes fast", () => {
    expect(remainingOnSkewedClient(5 * MIN)).toBe(50_000);
  });

  it("is unaffected by a client clock 5 minutes slow", () => {
    expect(remainingOnSkewedClient(-5 * MIN)).toBe(50_000);
  });

  it("would be wrong without correction (guards the test itself)", () => {
    const snapshot = liveSnapshot(SERVER_NOW + 60_000);
    const fastClientNow = SERVER_NOW + 5 * MIN + 10_000;
    expect(computeTimerRemainingMs(snapshot, fastClientNow)).toBe(0);
    const slowClientNow = SERVER_NOW - 5 * MIN + 10_000;
    expect(computeTimerRemainingMs(snapshot, slowClientNow)).toBe(90_000);
  });

  it("feeds the clock text the same corrected time", () => {
    const snapshot = liveSnapshot(SERVER_NOW + 60_000);
    const offset = estimateServerOffsetMs({
      serverTime: new Date(SERVER_NOW).toISOString(),
      receivedAtMs: SERVER_NOW + 5 * MIN
    }) as number;
    const clientNow = SERVER_NOW + 5 * MIN + 10_000;
    expect(formatTimer(snapshot.draft, toServerNowMs(clientNow, offset))).toBe(
      "90s • 50s left"
    );
  });

  it("splits the round trip when the send time is known", () => {
    // Client clock 5 min fast; request took 400ms, so the server stamped at the midpoint.
    const skew = 5 * MIN;
    const sentAt = SERVER_NOW - 200 + skew;
    const receivedAt = SERVER_NOW + 200 + skew;
    const offset = estimateServerOffsetMs({
      serverTime: new Date(SERVER_NOW).toISOString(),
      receivedAtMs: receivedAt,
      sentAtMs: sentAt
    });
    expect(offset).toBe(-skew);
  });

  it("ignores a send time later than the receive time", () => {
    const offset = estimateServerOffsetMs({
      serverTime: new Date(SERVER_NOW).toISOString(),
      receivedAtMs: SERVER_NOW,
      sentAtMs: SERVER_NOW + 5_000
    });
    expect(offset).toBe(0);
  });

  it("returns null for a missing or invalid stamp", () => {
    expect(estimateServerOffsetMs({ serverTime: undefined, receivedAtMs: 1 })).toBeNull();
    expect(estimateServerOffsetMs({ serverTime: null, receivedAtMs: 1 })).toBeNull();
    expect(estimateServerOffsetMs({ serverTime: "garbage", receivedAtMs: 1 })).toBeNull();
  });
});
