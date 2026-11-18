import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/orchestration/query/client";
import {
  useCircuitCeremonyBreakdownOrchestration,
  useCircuitStandingsOrchestration
} from "@/orchestration/circuitStandings";
import { useCircuitScoreSocket } from "@/orchestration/useCircuitScoreSocket";
import { queryKeys } from "@/orchestration/query/keys";
import type { CircuitLeagueStatus, CircuitStandings } from "@/lib/types";
import { circuitLeagueDetail } from "../circuitLeagues/fixtures";
import { createFakeSocket, socketModule, sockets } from "../circuitLeagues/fakeSocket";

vi.mock(
  "socket.io-client",
  async () => (await import("../circuitLeagues/fakeSocket")).socketModule
);

type Reply = { status: number; body: unknown };

const standings: CircuitStandings = { standings: [], ceremonies: [] };

/** Answers "METHOD /path" (under /circuit-leagues/4) and records the paths asked for. */
function stubApi(status: CircuitLeagueStatus, routes: Record<string, Reply> = {}) {
  const paths: string[] = [];
  const base: Record<string, Reply> = {
    "GET /": { status: 200, body: circuitLeagueDetail({ status }) },
    "GET /standings": { status: 200, body: standings }
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname.replace(/^\/api/, "");
      paths.push(path);
      const key = `${init?.method ?? "GET"} ${path.replace("/circuit-leagues/4", "") || "/"}`;
      const reply = routes[key] ?? base[key] ?? { status: 500, body: {} };
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        json: () => Promise.resolve(reply.body)
      });
    })
  );
  return paths;
}

function wrapper() {
  const client = createQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
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

describe("useCircuitStandingsOrchestration", () => {
  it("loads the standings once the season is under way", async () => {
    stubApi("IN_SEASON");
    const { result } = renderHook(
      () => useCircuitStandingsOrchestration({ circuitLeagueId: 4 }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.view.state).toBe("ready"));
    expect(result.current.view).toMatchObject({ standings });
    expect(socketModule.io).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing more before the draft finishes", async () => {
    const paths = stubApi("DRAFTING");
    const { result } = renderHook(
      () => useCircuitStandingsOrchestration({ circuitLeagueId: 4 }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.view.state).toBe("not-started"));
    expect(paths).toEqual(["/circuit-leagues/4"]);
    expect(socketModule.io).not.toHaveBeenCalled();
  });

  it("reports an unknown season as not found", async () => {
    stubApi("IN_SEASON", {
      "GET /": {
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "Season not found" } }
      }
    });
    const { result } = renderHook(
      () => useCircuitStandingsOrchestration({ circuitLeagueId: 4 }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.view.state).toBe("error"));
    expect(result.current.view).toMatchObject({ notFound: true });
  });
});

describe("useCircuitCeremonyBreakdownOrchestration", () => {
  it("loads one ceremony's points, and treats a bad ceremony id as not found", async () => {
    const breakdown = { ceremony: { id: 11 }, standings: [] };
    stubApi("IN_SEASON", {
      "GET /standings/ceremonies/11": { status: 200, body: breakdown }
    });
    const { result } = renderHook(
      () =>
        useCircuitCeremonyBreakdownOrchestration({ circuitLeagueId: 4, ceremonyId: 11 }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.view.state).toBe("ready"));
    expect(result.current.view).toMatchObject({ breakdown });

    const bad = renderHook(
      () =>
        useCircuitCeremonyBreakdownOrchestration({ circuitLeagueId: 4, ceremonyId: NaN }),
      { wrapper: wrapper() }
    );
    expect(bad.result.current.view).toMatchObject({ state: "error", notFound: true });
  });
});

describe("useCircuitScoreSocket", () => {
  function setup(enabled = true) {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useCircuitScoreSocket({ circuitLeagueId: 4, enabled }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    });
    return () => invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
  }

  it("refreshes the standings and every breakdown on a ledger change", () => {
    const invalidated = setup();
    sockets.current.emitLocal("connect");
    expect(invalidated()).toEqual([]);

    sockets.current.emitLocal("score:update", {
      circuit_league_id: 99,
      ceremony_ids: [1]
    });
    expect(invalidated()).toEqual([]);
    sockets.current.emitLocal("score:update", {
      circuit_league_id: 4,
      ceremony_ids: [1]
    });
    expect(invalidated()).toEqual([
      JSON.stringify(queryKeys.circuitLeagues.standings(4))
    ]);
  });

  it("catches up after a reconnect, and stays off when disabled", () => {
    const invalidated = setup();
    sockets.current.emitLocal("connect");
    sockets.current.emitLocal("connect");
    expect(invalidated()).toHaveLength(1);
    cleanup();
    socketModule.io.mockClear();
    setup(false);
    expect(socketModule.io).not.toHaveBeenCalled();
  });
});
