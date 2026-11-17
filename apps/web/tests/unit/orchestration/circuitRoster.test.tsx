import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/orchestration/query/client";
import {
  useCircuitRosterOrchestration,
  useCircuitTransactionsOrchestration
} from "@/orchestration/circuitRoster";
import type { CircuitRoster } from "@/lib/types";
import {
  circuitLeagueDetail,
  circuitRoster,
  circuitSelection
} from "../circuitLeagues/fixtures";

type Call = { method: string; path: string; body: unknown };
type Reply = { status: number; body: unknown };

/** Answers "METHOD /path" (under /circuit-leagues/4) from `routes`; the detail by default. */
function stubApi(routes: Record<string, Reply>) {
  const calls: Call[] = [];
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
      const reply =
        routes[key] ??
        (key === "GET /"
          ? { status: 200, body: circuitLeagueDetail({ status: "IN_SEASON" }) }
          : { status: 500, body: {} });
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        json: () => Promise.resolve(reply.body)
      });
    })
  );
  return calls;
}

function wrapper() {
  const client = createQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function renderRoster(memberUserId: number | null = null) {
  return renderHook(
    () =>
      useCircuitRosterOrchestration({
        circuitLeagueId: 4,
        memberUserId,
        viewerUserId: 5
      }),
    { wrapper: wrapper() }
  );
}

async function ready(result: {
  current: ReturnType<typeof useCircuitRosterOrchestration>;
}) {
  await waitFor(() => expect(result.current.view.state).toBe("ready"));
  const view = result.current.view;
  if (view.state !== "ready") throw new Error("not ready");
  return view;
}

const writes = (calls: Call[]) => calls.filter((c) => c.method === "POST");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("circuit roster", () => {
  it("shows the viewer's own roster as writable while free agency is open", async () => {
    stubApi({ "GET /roster": { status: 200, body: circuitRoster() } });
    const { result } = renderRoster();
    const view = await ready(result);
    expect(view.own).toBe(true);
    expect(view.writable).toBe(true);
    expect(view.freeAgencyNote).toBeNull();
    expect(view.roster?.entries).toHaveLength(2);
  });

  it("reads another member's roster read-only, and treats the viewer's own id as their own", async () => {
    const calls = stubApi({
      "GET /members/6/roster": {
        status: 200,
        body: { ...circuitRoster(), member: { user_id: 6, username: "blake" } }
      },
      "GET /roster": { status: 200, body: circuitRoster() }
    });
    const other = renderRoster(6);
    const view = await ready(other.result);
    expect(view.own).toBe(false);
    expect(view.writable).toBe(false);
    expect(other.result.current.dropOptions).toEqual([]);

    const self = renderRoster(5);
    expect((await ready(self.result)).own).toBe(true);
    expect(calls.some((c) => c.path === "/circuit-leagues/4/members/5/roster")).toBe(
      false
    );
  });

  it("is ready with no roster when the viewer has not joined", async () => {
    stubApi({
      "GET /roster": {
        status: 403,
        body: { error: { code: "CIRCUIT_MEMBERSHIP_REQUIRED", message: "Join first" } }
      }
    });
    const { result } = renderRoster();
    const view = await ready(result);
    expect(view.roster).toBeNull();
    expect(view.writable).toBe(false);
  });

  it("adds a free agent with the chosen drop in one request and shows the new roster", async () => {
    const after: CircuitRoster = circuitRoster({
      rosterSize: 2,
      entries: [
        circuitSelection(9, "New Film"),
        circuitSelection(2, "Paper Moon", "Ada Lane")
      ]
    });
    const calls = stubApi({
      "GET /roster": { status: 200, body: circuitRoster({ rosterSize: 2 }) },
      "POST /free-agents": { status: 200, body: after },
      "GET /transactions": { status: 200, body: { transactions: [] } }
    });
    const { result } = renderRoster();
    await ready(result);

    act(() => result.current.chooseDrop(1));
    let added = false;
    await act(async () => {
      added = await result.current.addFreeAgent(circuitSelection(9, "New Film"));
    });
    expect(added).toBe(true);
    expect(writes(calls)).toEqual([
      {
        method: "POST",
        path: "/circuit-leagues/4/free-agents",
        body: { selection_id: 9, drop_selection_id: 1 }
      }
    ]);
    const view = await ready(result);
    expect(view.roster?.entries.map((e) => e.selection.id)).toEqual([9, 2]);
    expect(result.current.pending).toBeNull();
    expect(result.current.dropSelectionId).toBeNull();
  });

  it("asks for a drop at capacity without sending, then retries the pending pick", async () => {
    const calls = stubApi({
      "GET /roster": { status: 200, body: circuitRoster({ rosterSize: 2 }) },
      "POST /free-agents": { status: 200, body: circuitRoster({ rosterSize: 2 }) }
    });
    const { result } = renderRoster();
    await ready(result);

    await act(async () => {
      await result.current.addFreeAgent(circuitSelection(9, "New Film"));
    });
    expect(writes(calls)).toHaveLength(0);
    expect(result.current.addStatus?.message).toBe(
      "Your roster is full. Choose a pick to drop."
    );
    expect(result.current.pending?.id).toBe(9);

    act(() => result.current.chooseDrop(2));
    expect(result.current.addStatus).toBeNull();
    expect(result.current.pending?.id).toBe(9);
    await act(async () => {
      await result.current.retryPending();
    });
    expect(writes(calls).map((c) => c.body)).toEqual([
      { selection_id: 9, drop_selection_id: 2 }
    ]);
  });

  it("keeps the pick pending and explains a refusal inside a waiver window", async () => {
    stubApi({
      "GET /roster": { status: 200, body: circuitRoster() },
      "POST /free-agents": {
        status: 409,
        body: { error: { code: "CIRCUIT_WAIVER_WINDOW_OPEN", message: "Closed" } }
      }
    });
    const { result } = renderRoster();
    await ready(result);
    let added = true;
    await act(async () => {
      added = await result.current.addFreeAgent(circuitSelection(9, "New Film"));
    });
    expect(added).toBe(false);
    expect(result.current.addStatus).toMatchObject({
      ok: false,
      message: "Free agency is closed while waiver claims are open."
    });
    expect(result.current.pending?.id).toBe(9);
    act(() => result.current.cancelPending());
    expect(result.current.pending).toBeNull();
    expect(result.current.addStatus).toBeNull();
  });

  it("drops a pick only after the player confirms", async () => {
    const calls = stubApi({
      "GET /roster": { status: 200, body: circuitRoster() },
      "POST /drops": {
        status: 200,
        body: circuitRoster({ entries: [circuitSelection(2, "Paper Moon", "Ada Lane")] })
      },
      "GET /transactions": { status: 200, body: { transactions: [] } }
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    const { result } = renderRoster();
    const entry = (await ready(result)).roster!.entries[0]!;

    await act(async () => result.current.drop(entry));
    expect(writes(calls)).toHaveLength(0);

    confirm.mockReturnValueOnce(true);
    await act(async () => result.current.drop(entry));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]!.body).toEqual({ selection_id: 1 });
    await waitFor(async () =>
      expect((await ready(result)).roster?.entries.map((e) => e.selection.id)).toEqual([
        2
      ])
    );
  });

  it("closes free agency inside a window", async () => {
    stubApi({
      "GET /roster": {
        status: 200,
        body: circuitRoster({
          freeAgency: {
            open: false,
            window: {
              starts_on: "2027-01-08",
              ends_on: "2027-01-10",
              resolves_on: "2027-01-11",
              scoring_days: ["2027-01-08"]
            }
          }
        })
      }
    });
    const { result } = renderRoster();
    expect((await ready(result)).freeAgencyNote).toContain("Jan 11, 2027");
  });
});

describe("circuit transaction log", () => {
  it("loads the season and its transactions", async () => {
    stubApi({
      "GET /transactions": {
        status: 200,
        body: {
          transactions: [
            {
              id: 3,
              kind: "FREE_AGENT",
              occurred_at: "2026-12-02T08:00:00Z",
              member: { user_id: 5, username: "avery" },
              add: circuitSelection(9, "New Film"),
              drop: circuitSelection(1, "Night Train")
            }
          ]
        }
      }
    });
    const { result } = renderHook(
      () => useCircuitTransactionsOrchestration({ circuitLeagueId: 4 }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.view.state).toBe("ready"));
    const view = result.current.view;
    if (view.state !== "ready") throw new Error("not ready");
    expect(view.transactions.map((t) => t.id)).toEqual([3]);
  });

  it("reports a missing season", async () => {
    stubApi({
      "GET /": { status: 404, body: { error: { code: "NOT_FOUND", message: "Nope" } } },
      "GET /transactions": { status: 404, body: {} }
    });
    const { result } = renderHook(
      () => useCircuitTransactionsOrchestration({ circuitLeagueId: 4 }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.view.state).toBe("error"));
    expect(result.current.view).toMatchObject({ notFound: true });
  });
});
