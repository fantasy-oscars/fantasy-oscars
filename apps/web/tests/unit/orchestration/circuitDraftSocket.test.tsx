import type { ReactNode } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCircuitDraftSocket } from "@/orchestration/useCircuitDraftSocket";
import { queryKeys } from "@/orchestration/query/keys";
import type { CircuitDraftEventMessage, CircuitDraftSnapshot } from "@/lib/types";
import { circuitDraftSnapshot, circuitSelection } from "../circuitLeagues/fixtures";
import { createFakeSocket, socketModule, sockets } from "../circuitLeagues/fakeSocket";

vi.mock(
  "socket.io-client",
  async () => (await import("../circuitLeagues/fakeSocket")).socketModule
);

const draftKey = queryKeys.circuitLeagues.draft(4);

/** The event that resolves pick 2 of the two-pick fixture snapshot. */
function pickTwo(version: number): CircuitDraftEventMessage {
  const snapshot = circuitDraftSnapshot({ picks: 2 });
  return {
    draft_id: 9,
    circuit_league_id: 4,
    version,
    event_type: "draft.pick.made",
    payload: {
      draft: { ...snapshot.draft },
      on_the_clock: snapshot.on_the_clock,
      pick: snapshot.picks[1]!,
      selection: circuitSelection(32, "All About Eve")
    },
    created_at: "2026-11-28T18:01:00Z",
    server_time: "2026-11-28T18:01:00Z"
  };
}

function setup(initial: CircuitDraftSnapshot | null | undefined, enabled = true) {
  const client = new QueryClient();
  if (initial !== undefined) client.setQueryData(draftKey, initial);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onConnectionEvent = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => useCircuitDraftSocket({ circuitLeagueId: 4, enabled, onConnectionEvent }),
    { wrapper }
  );
  const invalidated = () =>
    invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  return { client, invalidated, onConnectionEvent, hook };
}

beforeEach(() => {
  sockets.current = createFakeSocket();
  socketModule.io.mockClear();
});
afterEach(cleanup);

describe("useCircuitDraftSocket", () => {
  it("joins the league's room on /circuits and resyncs the board on every connect", () => {
    const { invalidated, onConnectionEvent } = setup(circuitDraftSnapshot({ picks: 1 }));
    const [url, options] = socketModule.io.mock.calls[0] as [string, { auth: unknown }];
    expect(url).toContain("/circuits");
    expect(options.auth).toEqual({ circuitLeagueId: 4 });
    expect(onConnectionEvent).toHaveBeenCalledWith("start");

    sockets.current.emitLocal("connect");
    expect(onConnectionEvent).toHaveBeenCalledWith("connect");
    expect(invalidated()).toEqual([JSON.stringify(draftKey)]);

    // A dropped transport retries by itself; the reconnect resyncs again.
    sockets.current.emitLocal("disconnect", "transport close");
    expect(onConnectionEvent).toHaveBeenCalledWith("disconnect_transient");
    sockets.current.emitManager("reconnect_attempt");
    expect(onConnectionEvent).toHaveBeenCalledWith("reconnect_attempt");
    sockets.current.emitLocal("connect");
    expect(invalidated()).toEqual([JSON.stringify(draftKey), JSON.stringify(draftKey)]);
  });

  it("applies the next version to the cached board and ignores a repeat", () => {
    const { client, invalidated } = setup(circuitDraftSnapshot({ picks: 1 }));
    sockets.current.emitLocal("draft:event", pickTwo(3));
    const after = client.getQueryData<CircuitDraftSnapshot>(draftKey)!;
    expect(after.draft.version).toBe(3);
    expect(after.picks.map((p) => p.pick_number)).toEqual([1, 2]);
    expect(after.selections.map((s) => s.id)).toEqual([31, 32]);
    expect(after.on_the_clock?.pick_number).toBe(3);

    sockets.current.emitLocal("draft:event", pickTwo(3));
    expect(client.getQueryData<CircuitDraftSnapshot>(draftKey)!.picks).toHaveLength(2);
    expect(invalidated()).toEqual([]);
  });

  it("refetches the board on a version gap instead of applying it", () => {
    const before = circuitDraftSnapshot({ picks: 1 });
    const { client, invalidated } = setup(before);
    sockets.current.emitLocal("draft:event", pickTwo(5));
    expect(client.getQueryData(draftKey)).toBe(before);
    expect(invalidated()).toEqual([JSON.stringify(draftKey)]);
  });

  it("loads the board and the league when the draft starts in the lobby", () => {
    const { invalidated } = setup(null);
    sockets.current.emitLocal("draft:event", {
      ...pickTwo(1),
      event_type: "draft.started",
      payload: { draft: circuitDraftSnapshot({ picks: 0 }).draft, on_the_clock: null }
    });
    expect(invalidated()).toEqual(
      expect.arrayContaining([
        JSON.stringify(draftKey),
        JSON.stringify(queryKeys.circuitLeagues.detail(4))
      ])
    );
  });

  it("stays off when disabled and disconnects on unmount", () => {
    setup(circuitDraftSnapshot(), false);
    expect(socketModule.io).not.toHaveBeenCalled();

    const { hook, onConnectionEvent } = setup(circuitDraftSnapshot({ picks: 1 }));
    hook.unmount();
    expect(sockets.current.disconnect).toHaveBeenCalled();
    expect(onConnectionEvent).toHaveBeenLastCalledWith("stop");
  });
});
