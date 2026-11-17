import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/orchestration/query/client";
import { useCircuitDraftOrchestration } from "@/orchestration/circuitDraft";
import type { CircuitLeagueDetail } from "@/lib/types";
import {
  circuitDraftSnapshot,
  circuitLeagueDetail,
  circuitQueue,
  circuitSelection
} from "../circuitLeagues/fixtures";
import { createFakeSocket, sockets } from "../circuitLeagues/fakeSocket";

vi.mock(
  "socket.io-client",
  async () => (await import("../circuitLeagues/fakeSocket")).socketModule
);

type Call = { method: string; path: string; body: unknown };
type Reply = { status: number; body: unknown };

const NOT_STARTED: Reply = {
  status: 404,
  body: { error: { code: "CIRCUIT_DRAFT_NOT_STARTED", message: "Not started" } }
};

const gaslight = circuitSelection(33, "Gaslight", "Ingrid Bergman");
const sunset = circuitSelection(31, "Sunset Boulevard");
const laura = circuitSelection(34, "Laura");

/** Answers "METHOD /path" (under /circuit-leagues/4) from `routes`. */
function stubApi(routes: Record<string, Reply | Reply[]>, detail?: CircuitLeagueDetail) {
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
      const found = routes[key];
      const reply = Array.isArray(found)
        ? (found.length > 1 ? found.shift() : found[0])!
        : (found ??
          (key === "GET /"
            ? {
                status: 200,
                body: detail ?? circuitLeagueDetail({ status: "INITIALIZED" })
              }
            : { status: 500, body: {} }));
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        json: () => Promise.resolve(reply.body)
      });
    })
  );
  return calls;
}

/** Blake (user 6) holds pick 2 of the fixture draft; avery is user 5. */
function renderDraft(viewerUserId = 5) {
  const client = createQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return renderHook(
    () => useCircuitDraftOrchestration({ circuitLeagueId: 4, viewerUserId }),
    {
      wrapper: Wrapper
    }
  );
}

async function ready(result: {
  current: ReturnType<typeof useCircuitDraftOrchestration>;
}) {
  await waitFor(() => expect(result.current.view.state).toBe("ready"));
  const view = result.current.view;
  if (view.state !== "ready") throw new Error("not ready");
  return view;
}

beforeEach(() => {
  sockets.current = createFakeSocket();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("circuit draft orchestration", () => {
  it("shows the lobby before the draft starts, with the viewer's queue", async () => {
    stubApi({
      "GET /draft": NOT_STARTED,
      "GET /queue": { status: 200, body: circuitQueue([gaslight, sunset]) }
    });
    const { result } = renderDraft();
    const view = await ready(result);
    expect(view.phase).toBe("lobby");
    expect(view.snapshot).toBeNull();
    expect(view.canStart).toBe(true);
    expect(view.queue?.map((r) => r.selection.id)).toEqual([33, 31]);
  });

  it("shows the board from the snapshot once the draft has started", async () => {
    stubApi(
      {
        "GET /draft": { status: 200, body: circuitDraftSnapshot({ picks: 2 }) },
        "GET /queue": { status: 200, body: circuitQueue([sunset, laura]) }
      },
      circuitLeagueDetail({ status: "DRAFTING" })
    );
    const { result } = renderDraft();
    const view = await ready(result);
    expect(view.phase).toBe("live");
    expect(view.canStart).toBe(false);
    expect(view.queue?.map((r) => r.drafted)).toEqual([true, false]);
  });

  it("does not ask for a queue when the viewer has not joined", async () => {
    const calls = stubApi(
      { "GET /draft": NOT_STARTED },
      circuitLeagueDetail({
        status: "INITIALIZED",
        viewer: { is_member: false, can_manage: false }
      })
    );
    const { result } = renderDraft();
    const view = await ready(result);
    expect(view.queue).toBeNull();
    expect(view.canStart).toBe(false);
    expect(calls.some((c) => c.path.endsWith("/queue"))).toBe(false);
  });

  it("adds, reorders and removes queue rows, each write replacing the queue", async () => {
    const calls = stubApi({
      "GET /draft": NOT_STARTED,
      "GET /queue": { status: 200, body: circuitQueue([gaslight, sunset]) },
      "POST /queue": { status: 201, body: circuitQueue([gaslight, sunset, laura]) },
      "PUT /queue": { status: 200, body: circuitQueue([laura, gaslight, sunset]) },
      "DELETE /queue/31": { status: 200, body: circuitQueue([laura, gaslight]) }
    });
    const { result } = renderDraft();
    await ready(result);

    let added = false;
    await act(async () => {
      added = await result.current.addToQueue(laura);
    });
    expect(added).toBe(true);
    expect(calls.at(-1)).toMatchObject({ method: "POST", body: { selection_id: 34 } });

    await act(async () => {
      result.current.reorderQueue([34, 33, 31]);
    });
    await waitFor(() => expect(result.current.queueBusy).toBe(false));
    expect(calls.at(-1)).toMatchObject({
      method: "PUT",
      body: { selection_ids: [34, 33, 31] }
    });

    await act(async () => {
      result.current.removeFromQueue(31);
    });
    await waitFor(() => {
      const view = result.current.view;
      expect(view.state === "ready" && view.queue?.map((r) => r.selection.id)).toEqual([
        34, 33
      ]);
    });
    expect(calls.at(-1)).toMatchObject({
      method: "DELETE",
      path: "/circuit-leagues/4/queue/31"
    });
  });

  it("reloads the queue when a reorder finds it changed elsewhere", async () => {
    const calls = stubApi({
      "GET /draft": NOT_STARTED,
      "GET /queue": [
        { status: 200, body: circuitQueue([gaslight, sunset]) },
        { status: 200, body: circuitQueue([gaslight, sunset, laura]) }
      ],
      "PUT /queue": {
        status: 409,
        body: { error: { code: "CIRCUIT_QUEUE_CHANGED", message: "Changed" } }
      }
    });
    const { result } = renderDraft();
    await ready(result);
    await act(async () => {
      result.current.reorderQueue([31, 33]);
    });
    await waitFor(() => expect(result.current.queueStatus?.ok).toBe(false));
    expect(result.current.queueStatus?.message).toMatch(/changed in another window/);
    await waitFor(() => {
      const view = result.current.view;
      expect(view.state === "ready" && view.queue?.length).toBe(3);
    });
    expect(
      calls.filter((c) => c.method === "GET" && c.path.endsWith("/queue"))
    ).toHaveLength(2);
  });

  it("starts the draft only after the commissioner confirms, then loads the board", async () => {
    const calls = stubApi({
      "GET /draft": [
        NOT_STARTED,
        { status: 200, body: circuitDraftSnapshot({ picks: 0 }) }
      ],
      "GET /queue": { status: 200, body: circuitQueue([]) },
      "POST /draft": { status: 201, body: {} }
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    const { result } = renderDraft();
    await ready(result);

    await act(async () => {
      result.current.startDraft();
    });
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    confirm.mockReturnValueOnce(true);
    await act(async () => {
      result.current.startDraft();
    });
    await waitFor(() => {
      const view = result.current.view;
      expect(view.state === "ready" && view.phase).toBe("live");
    });
    expect(
      calls.filter((c) => c.method === "POST" && c.path.endsWith("/draft"))
    ).toHaveLength(1);
  });

  it("lets only the player on the clock pick, and posts the pick with a request id", async () => {
    const calls = stubApi(
      {
        "GET /draft": { status: 200, body: circuitDraftSnapshot({ picks: 1 }) },
        "GET /queue": { status: 200, body: circuitQueue([laura]) },
        "POST /circuit-drafts/9/picks": { status: 201, body: {} }
      },
      circuitLeagueDetail({ status: "DRAFTING" })
    );
    const { result } = renderDraft(6);
    const view = await ready(result);
    // Not connected yet: the pick waits for nothing but the turn.
    expect(view.gate).toEqual({
      onTheClock: true,
      canPick: true,
      reason: "You're on the clock."
    });

    let drafted = false;
    await act(async () => {
      drafted = await result.current.draftSelection(laura);
    });
    expect(drafted).toBe(true);
    const pick = calls.find((c) => c.method === "POST" && c.path.endsWith("/picks"));
    expect(pick?.body).toMatchObject({ selection_id: 34 });
    expect(typeof (pick?.body as { request_id?: unknown }).request_id).toBe("string");
  });

  it("refuses an already drafted contender without asking, and explains a refused pick", async () => {
    const calls = stubApi(
      {
        "GET /draft": { status: 200, body: circuitDraftSnapshot({ picks: 1 }) },
        "GET /queue": { status: 200, body: circuitQueue([]) },
        "POST /circuit-drafts/9/picks": {
          status: 409,
          body: { error: { code: "CIRCUIT_DRAFT_NOT_YOUR_TURN", message: "No" } }
        }
      },
      circuitLeagueDetail({ status: "DRAFTING" })
    );
    const { result } = renderDraft(6);
    await ready(result);

    await act(async () => {
      await result.current.draftSelection(sunset);
    });
    expect(result.current.pickStatus?.message).toMatch(/already drafted/);
    expect(calls.some((c) => c.path.endsWith("/picks"))).toBe(false);

    await act(async () => {
      await result.current.draftSelection(laura);
    });
    expect(result.current.pickStatus?.message).toMatch(/isn't your pick/);
  });

  it("blocks the pick while the connection is lost, and shows whose turn it is to others", async () => {
    stubApi(
      {
        "GET /draft": { status: 200, body: circuitDraftSnapshot({ picks: 1 }) },
        "GET /queue": { status: 200, body: circuitQueue([]) }
      },
      circuitLeagueDetail({ status: "DRAFTING" })
    );
    const { result } = renderDraft(6);
    await ready(result);
    act(() => {
      sockets.current.emitLocal("connect");
      sockets.current.emitLocal("disconnect", "transport close");
    });
    await waitFor(() => expect(result.current.connection.state).toBe("reconnecting"));
    const view = result.current.view;
    expect(view.state === "ready" && view.gate?.canPick).toBe(false);

    const other = renderDraft(5);
    const otherView = await ready(other.result);
    expect(otherView.gate?.reason).toBe("Waiting for blake to pick.");
  });

  it("pauses and resumes for the commissioner", async () => {
    const calls = stubApi(
      {
        "GET /draft": { status: 200, body: circuitDraftSnapshot({ picks: 1 }) },
        "GET /queue": { status: 200, body: circuitQueue([]) },
        "POST /circuit-drafts/9/pause": { status: 200, body: {} }
      },
      circuitLeagueDetail({ status: "DRAFTING" })
    );
    const { result } = renderDraft();
    const view = await ready(result);
    expect(view.canPause).toBe(true);
    await act(async () => {
      result.current.togglePause();
    });
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/pause"))).toBe(
        true
      )
    );
  });
});
