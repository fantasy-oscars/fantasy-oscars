import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/orchestration/query/client";
import { useCircuitLeagueOrchestration } from "@/orchestration/circuitLeague";
import type { CircuitLeagueDetail } from "@/lib/types";
import { circuitLeagueDetail } from "../circuitLeagues/fixtures";

type Call = { method: string; path: string; body: unknown };
type Reply = { status: number; body: unknown };

function respond(reply: Reply) {
  return Promise.resolve({
    ok: reply.status < 400,
    status: reply.status,
    json: () => Promise.resolve(reply.body)
  });
}

/** Serves the detail on GET and answers writes from `writes`, keyed "METHOD /path". */
function stubApi(initial: CircuitLeagueDetail, writes: Record<string, Reply>) {
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
      if (method === "GET") return respond({ status: 200, body: initial });
      const key = `${method} ${path.replace("/circuit-leagues/4", "")}`;
      return respond(writes[key] ?? { status: 500, body: {} });
    })
  );
  return calls;
}

function render() {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCircuitLeagueOrchestration({ circuitLeagueId: 4 }), {
    wrapper
  });
}

async function ready(result: {
  current: ReturnType<typeof useCircuitLeagueOrchestration>;
}) {
  await waitFor(() => expect(result.current.view.state).toBe("ready"));
  const view = result.current.view;
  if (view.state !== "ready") throw new Error("not ready");
  return view;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("circuit league settings", () => {
  it("writes only the changed parts, settings before events, and shows the result", async () => {
    const saved = circuitLeagueDetail();
    saved.circuit_league.roster_size = 12;
    saved.events[1]!.enabled = false;
    const calls = stubApi(circuitLeagueDetail(), {
      "PATCH /settings": {
        status: 200,
        body: { ...saved, events: circuitLeagueDetail().events }
      },
      "PUT /events": { status: 200, body: saved }
    });
    const { result } = render();
    await ready(result);

    act(() =>
      result.current.updateForm((f) => ({
        ...f,
        rosterSize: 12,
        events: { ...f.events, 11: { enabled: false, weight: 1 } }
      }))
    );
    expect((await ready(result)).dirty).toBe(true);
    await act(() => result.current.save());

    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes).toEqual([
      { method: "PATCH", path: "/circuit-leagues/4/settings", body: { roster_size: 12 } },
      {
        method: "PUT",
        path: "/circuit-leagues/4/events",
        body: { events: [{ circuit_event_id: 10, weight: 1 }] }
      }
    ]);
    const view = await ready(result);
    expect(view.dirty).toBe(false);
    expect(view.form.events[11]!.enabled).toBe(false);
    expect(result.current.settingsStatus).toBeNull();
  });

  it("keeps unsaved edits when a later write is refused", async () => {
    const afterSettings = circuitLeagueDetail();
    afterSettings.circuit_league.roster_size = 12;
    stubApi(circuitLeagueDetail(), {
      "PATCH /settings": { status: 200, body: afterSettings },
      "PUT /events": {
        status: 409,
        body: {
          error: { code: "CIRCUIT_LEAGUE_LOCKED", message: "This season is locked" }
        }
      }
    });
    const { result } = render();
    await ready(result);
    act(() =>
      result.current.updateForm((f) => ({
        ...f,
        rosterSize: 12,
        events: { ...f.events, 11: { enabled: false, weight: 1 } }
      }))
    );
    await act(() => result.current.save());

    expect(result.current.settingsStatus).toMatchObject({
      ok: false,
      message: "This season is locked"
    });
    const view = await ready(result);
    expect(view.detail.circuit_league.roster_size).toBe(12);
    expect(view.form.events[11]!.enabled).toBe(false);
    expect(view.dirty).toBe(true);
  });
});

describe("circuit league membership", () => {
  it("shows the server's message when a join is refused", async () => {
    const calls = stubApi(circuitLeagueDetail({ viewer: { is_member: false } }), {
      "POST /join": {
        status: 409,
        body: {
          error: { code: "CIRCUIT_LEAGUE_LOCKED", message: "This season is locked" }
        }
      }
    });
    const { result } = render();
    await ready(result);
    await act(() => result.current.join());
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/join"))).toBe(true);
    expect(result.current.memberStatus).toMatchObject({
      ok: false,
      message: "This season is locked"
    });
  });

  it("locks the season only after the commissioner confirms", async () => {
    const locked = circuitLeagueDetail({ status: "INITIALIZED" });
    const calls = stubApi(circuitLeagueDetail(), {
      "POST /initialize": { status: 200, body: locked }
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    const { result } = render();
    await ready(result);

    await act(() => result.current.initialize());
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    confirm.mockReturnValueOnce(true);
    await act(() => result.current.initialize());
    const view = await ready(result);
    expect(view.detail.circuit_league.status).toBe("INITIALIZED");
    expect(view.editable).toEqual({ all: false, draftClock: true });
  });
  it("reports a refused lock beside the lock button, not under the header", async () => {
    stubApi(circuitLeagueDetail(), {
      "POST /initialize": {
        status: 409,
        body: { error: { code: "CIRCUIT_LEAGUE_EMPTY", message: "Add a member first" } }
      }
    });
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    const { result } = render();
    await ready(result);
    await act(() => result.current.initialize());
    expect(result.current.lockStatus).toMatchObject({
      ok: false,
      message: "Add a member first"
    });
    expect(result.current.memberStatus).toBeNull();
  });
});
