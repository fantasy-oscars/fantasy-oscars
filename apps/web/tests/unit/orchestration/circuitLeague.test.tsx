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
  it("saves the roster area as a settings patch, then the changed limits with their saved weights", async () => {
    const detail = circuitLeagueDetail();
    detail.categories[0]!.weight = 2;
    const afterSettings = structuredClone(detail);
    afterSettings.circuit_league.roster_size = 12;
    const afterCategories = structuredClone(afterSettings);
    afterCategories.categories[0]!.max_owned = 3;
    const calls = stubApi(detail, {
      "PATCH /settings": { status: 200, body: afterSettings },
      "PUT /categories": { status: 200, body: afterCategories }
    });
    const { result } = render();
    const view = await ready(result);

    const next = {
      ...view.settings,
      rosterSize: 12,
      categories: { ...view.settings.categories, 20: { weight: 2, maxOwned: 3 } }
    };
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveArea("roster", next);
    });

    expect(outcome).toEqual({ ok: true });
    expect(calls.filter((c) => c.method !== "GET")).toEqual([
      { method: "PATCH", path: "/circuit-leagues/4/settings", body: { roster_size: 12 } },
      {
        method: "PUT",
        path: "/circuit-leagues/4/categories",
        body: { categories: [{ circuit_category_id: 20, weight: 2, max_owned: 3 }] }
      }
    ]);
    const saved = await ready(result);
    expect(saved.settings.rosterSize).toBe(12);
    expect(saved.settings.categories[20]).toEqual({ weight: 2, maxOwned: 3 });
  });

  it("sends the full enabled set when events change", async () => {
    const calls = stubApi(circuitLeagueDetail(), {
      "PUT /events": { status: 200, body: circuitLeagueDetail() }
    });
    const { result } = render();
    const view = await ready(result);
    await act(async () => {
      await result.current.saveArea("events", {
        ...view.settings,
        events: { 10: { enabled: true, weight: 1.5 }, 11: { enabled: false, weight: 1 } }
      });
    });
    expect(calls.filter((c) => c.method !== "GET")).toEqual([
      {
        method: "PUT",
        path: "/circuit-leagues/4/events",
        body: { events: [{ circuit_event_id: 10, weight: 1.5 }] }
      }
    ]);
  });

  it("says which part did not save, returns the stored values and refreshes after a lock", async () => {
    const afterSettings = circuitLeagueDetail();
    afterSettings.circuit_league.nomination_points = 3;
    const calls = stubApi(circuitLeagueDetail(), {
      "PATCH /settings": { status: 200, body: afterSettings },
      "PUT /categories": {
        status: 409,
        body: {
          error: {
            code: "CIRCUIT_LEAGUE_SETTINGS_LOCKED",
            message: "This season is locked"
          }
        }
      }
    });
    const { result } = render();
    const view = await ready(result);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveArea("scoring", {
        ...view.settings,
        nominationPoints: 3,
        categories: { ...view.settings.categories, 20: { weight: 2, maxOwned: null } }
      });
    });

    expect(outcome).toMatchObject({
      ok: false,
      message: "Some changes weren't saved: This season is locked",
      latest: { nominationPoints: 3 }
    });
    // The lock landed meanwhile: the detail is read again, so the area turns read-only.
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(1)
    );
  });

  it("returns the server's message alone when nothing saved", async () => {
    stubApi(circuitLeagueDetail(), {
      "PATCH /settings": {
        status: 400,
        body: { error: { code: "VALIDATION_FAILED", message: "Roster size is wrong" } }
      }
    });
    const { result } = render();
    const view = await ready(result);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveArea("roster", {
        ...view.settings,
        rosterSize: 9
      });
    });
    expect(outcome).toEqual({ ok: false, message: "Roster size is wrong" });
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
