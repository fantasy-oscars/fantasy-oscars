import { describe, expect, it } from "vitest";
import {
  describeConnection,
  nextConnectionState,
  type DraftConnectionEvent,
  type DraftConnectionState
} from "@/decisions/draft/connection";
import { computePickDisabledReason } from "@/decisions/draft";
import type { Snapshot } from "@/lib/types";

function run(events: DraftConnectionEvent[], from: DraftConnectionState = "idle") {
  return events.reduce(nextConnectionState, from);
}

describe("draft connection state", () => {
  it("walks the happy path", () => {
    expect(run(["start"])).toBe("connecting");
    expect(run(["start", "connect"])).toBe("connected");
  });

  it("reads a failed first connection as connecting, not reconnecting", () => {
    expect(run(["start", "connect_error", "reconnect_attempt"])).toBe("connecting");
  });

  it("reads a drop after being connected as reconnecting", () => {
    expect(run(["start", "connect", "disconnect_transient"])).toBe("reconnecting");
    expect(run(["start", "connect", "disconnect_transient", "reconnect_attempt"])).toBe(
      "reconnecting"
    );
    expect(run(["start", "connect", "disconnect_transient", "connect"])).toBe(
      "connected"
    );
  });

  it("reads a server-side close as disconnected", () => {
    expect(run(["start", "connect", "disconnect_final"])).toBe("disconnected");
  });

  it("returns to idle when the socket is torn down", () => {
    expect(run(["start", "connect", "stop"])).toBe("idle");
  });

  it("only shows the indicator when the connection is not healthy", () => {
    expect(describeConnection("idle").visible).toBe(false);
    expect(describeConnection("connected").visible).toBe(false);
    expect(describeConnection("connecting")).toMatchObject({
      visible: true,
      label: "Connecting to the draft…"
    });
    expect(describeConnection("reconnecting")).toMatchObject({
      visible: true,
      label: "Connection lost. Reconnecting…"
    });
    expect(describeConnection("disconnected")).toMatchObject({
      visible: true,
      label: "Disconnected from the draft."
    });
  });

  it("blocks picks while reconnecting or disconnected, with a reason", () => {
    expect(describeConnection("connected").pickBlockedReason).toBeNull();
    expect(describeConnection("connecting").pickBlockedReason).toBeNull();
    expect(describeConnection("reconnecting").pickBlockedReason).toMatch(/Reconnecting/);
    expect(describeConnection("disconnected").pickBlockedReason).toMatch(/Disconnected/);
  });

  it("surfaces the connection reason as the pick-disabled reason on my turn", () => {
    const snapshot = { draft: { status: "IN_PROGRESS" } } as unknown as Snapshot;
    const base = {
      snapshot,
      activeSeatNumber: 2,
      mySeatNumber: 2,
      selectedNominationId: 7,
      drafted: new Set<number>()
    };
    expect(computePickDisabledReason(base)).toBeNull();
    expect(
      computePickDisabledReason({
        ...base,
        connectionBlockedReason: describeConnection("disconnected").pickBlockedReason
      })
    ).toMatch(/Disconnected/);
    // Waiting on someone else stays the more relevant reason.
    expect(
      computePickDisabledReason({
        ...base,
        mySeatNumber: 1,
        connectionBlockedReason: "down"
      })
    ).toMatch(/Waiting for seat 2/);
  });
});
