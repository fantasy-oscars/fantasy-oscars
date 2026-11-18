import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/orchestration/query/client";
import { useCircuitWaiversOrchestration } from "@/orchestration/circuitWaivers";
import { useCircuitWaiverSocket } from "@/orchestration/useCircuitWaiverSocket";
import { queryKeys } from "@/orchestration/query/keys";
import type { CircuitClaims, CircuitWaivers } from "@/lib/types";
import {
  circuitLeagueDetail,
  circuitRoster,
  circuitSelection,
  OPEN_WINDOW
} from "../circuitLeagues/fixtures";
import { createFakeSocket, socketModule, sockets } from "../circuitLeagues/fakeSocket";

vi.mock(
  "socket.io-client",
  async () => (await import("../circuitLeagues/fakeSocket")).socketModule
);

type Call = { method: string; path: string; body: unknown };
type Reply = { status: number; body: unknown };

const harbor = circuitSelection(3, "Harbor");

const waivers: CircuitWaivers = {
  window: OPEN_WINDOW,
  priority: [{ user_id: 5, username: "avery", waiver_priority: 1 }],
  chips: []
};

const emptyClaims: CircuitClaims = {
  window: OPEN_WINDOW,
  locked: false,
  claims: [],
  chips: [{ id: 31, original_pick_number: 3, status: "AVAILABLE", claim_id: null }]
};

const filedClaims: CircuitClaims = {
  ...emptyClaims,
  claims: [
    {
      id: 8,
      rank: 1,
      status: "PENDING",
      failure_reason: null,
      selection: harbor,
      drop: null,
      chip: { id: 31, original_pick_number: 3 },
      created_at: "2027-01-08T09:00:00Z",
      updated_at: "2027-01-08T09:00:00Z"
    }
  ],
  chips: [{ id: 31, original_pick_number: 3, status: "AVAILABLE", claim_id: 8 }]
};

/** Answers "METHOD /path" (under /circuit-leagues/4) from `routes`. */
function stubApi(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  const base: Record<string, Reply> = {
    "GET /": { status: 200, body: circuitLeagueDetail({ status: "IN_SEASON" }) },
    "GET /waivers": { status: 200, body: waivers },
    "GET /waivers/results": { status: 200, body: { runs: [] } },
    "GET /claims": { status: 200, body: emptyClaims },
    "GET /roster": { status: 200, body: circuitRoster({ rosterSize: 2 }) }
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname.replace(/^\/api/, "");
      const method = init?.method ?? "GET";
      calls.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null
      });
      const key = `${method} ${path.replace("/circuit-leagues/4", "") || "/"}`;
      const reply = routes[key] ?? base[key] ?? { status: 500, body: {} };
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        json: () => Promise.resolve(reply.body)
      });
    })
  );
  return calls;
}

function renderWaivers() {
  const client = createQueryClient();
  return renderHook(() => useCircuitWaiversOrchestration({ circuitLeagueId: 4 }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  });
}

beforeEach(() => {
  sockets.current = createFakeSocket();
  socketModule.io.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("circuit waivers", () => {
  it("files a claim from the modal with its drop and chip", async () => {
    const calls = stubApi({ "POST /claims": { status: 201, body: filedClaims } });
    const { result } = renderWaivers();
    await waitFor(() => expect(result.current.view.state).toBe("ready"));
    const view = result.current.view;
    if (view.state !== "ready") throw new Error("not ready");
    expect(view.canClaim).toBe(true);
    await waitFor(() => expect(result.current.dropOptions).toHaveLength(2));

    act(() => {
      result.current.startClaim(harbor);
    });
    expect(result.current.warning).toBe(
      "Your roster is full. Without a drop, this claim fails."
    );
    expect(result.current.chipOptions.map((c) => c.id)).toEqual([31]);
    act(() => result.current.changeDraft({ dropSelectionId: 1, chipId: 31 }));
    expect(result.current.warning).toBeNull();

    act(() => result.current.saveClaim());
    await waitFor(() => expect(result.current.draft).toBeNull());
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      path: "/circuit-leagues/4/claims",
      body: { selection_id: harbor.id, drop_selection_id: 1, chip_id: 31 }
    });
    const after = result.current.view;
    expect(after.state === "ready" && after.pending.map((c) => c.id)).toEqual([8]);

    // A second claim on the same contender is caught before the modal.
    let opened = true;
    act(() => {
      opened = result.current.startClaim(harbor);
    });
    expect(opened).toBe(false);
    expect(result.current.listStatus?.message).toMatch(/already have a claim/);
  });

  it("keeps the modal open with the reason when the window is locked", async () => {
    stubApi({
      "POST /claims": {
        status: 409,
        body: { error: { code: "CIRCUIT_WAIVER_CLAIMS_LOCKED", message: "Locked" } }
      }
    });
    const { result } = renderWaivers();
    await waitFor(() => expect(result.current.view.state).toBe("ready"));
    act(() => {
      result.current.startClaim(harbor);
    });
    act(() => result.current.saveClaim());
    await waitFor(() => expect(result.current.modalStatus).not.toBeNull());
    expect(result.current.modalStatus?.message).toBe(
      "These claims are being processed and can no longer change."
    );
    expect(result.current.draft).not.toBeNull();
  });
});

describe("useCircuitWaiverSocket", () => {
  function setup(enabled = true) {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useCircuitWaiverSocket({ circuitLeagueId: 4, enabled }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    });
    return () => invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
  }

  it("refreshes results, priority, claims, rosters and transactions on a run", () => {
    const invalidated = setup();
    expect(socketModule.io).toHaveBeenCalledTimes(1);
    sockets.current.emitLocal("connect");
    expect(invalidated()).toEqual([]);

    sockets.current.emitLocal("waiver:result", { circuit_league_id: 99 });
    expect(invalidated()).toEqual([]);
    sockets.current.emitLocal("waiver:result", { circuit_league_id: 4 });
    expect(invalidated()).toEqual(
      [
        queryKeys.circuitLeagues.waivers(4),
        queryKeys.circuitLeagues.waiverResults(4),
        queryKeys.circuitLeagues.claims(4),
        queryKeys.circuitLeagues.rosters(4),
        queryKeys.circuitLeagues.transactions(4)
      ].map((k) => JSON.stringify(k))
    );
  });

  it("catches up after a reconnect, and stays off when disabled", () => {
    const invalidated = setup();
    sockets.current.emitLocal("connect");
    sockets.current.emitLocal("connect");
    expect(invalidated()).toHaveLength(5);
    cleanup();
    socketModule.io.mockClear();
    setup(false);
    expect(socketModule.io).not.toHaveBeenCalled();
  });
});
