import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/orchestration/query/client";
import { useLeagueSeasonCreateOrchestration } from "@/orchestration/seasons";
import { circuitLeagueDetail } from "../circuitLeagues/fixtures";

type Call = { method: string; path: string; body: unknown };

const CIRCUITS = [
  { id: 6, code: "c6", name: "2026–27 Awards Season", status: "ACTIVE" },
  { id: 5, code: "c5", name: "Awards Season 2036", status: "ACTIVE" }
];

function eventsOf(circuitId: number) {
  return [
    { id: circuitId * 10, name: "Golden Reel", is_group: false, ceremonies: [] },
    { id: circuitId * 10 + 1, name: "Guild Awards", is_group: false, ceremonies: [] }
  ];
}

function categoriesOf(circuitId: number) {
  return [{ id: circuitId * 100, name: "Best Picture" }];
}

function stubApi(role = "OWNER") {
  const calls: Call[] = [];
  const reply = (body: unknown, status = 200) =>
    Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(body)
    });
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
      if (method === "POST") return reply(circuitLeagueDetail(), 201);
      if (path === "/leagues/3") {
        return reply({ league: { id: 3, code: "club", name: "Film Club" } });
      }
      if (path === "/ceremonies/published") return reply({ ceremonies: [] });
      if (path === "/leagues/3/members") {
        return reply({ members: [{ id: 1, user_id: 7, role, username: "avery" }] });
      }
      if (path === "/circuits") return reply({ circuits: CIRCUITS });
      if (path === "/leagues/3/circuits") return reply({ circuit_leagues: [] });
      const match = /^\/circuits\/(\d+)\/(events|categories)$/.exec(path);
      if (match) {
        const id = Number(match[1]);
        return reply(
          match[2] === "events"
            ? { events: eventsOf(id) }
            : { categories: categoriesOf(id) }
        );
      }
      return reply({}, 404);
    })
  );
  return calls;
}

function render() {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useLeagueSeasonCreateOrchestration({
        leagueId: 3,
        userSub: "7"
      }),
    {
      wrapper
    }
  );
}

async function readyWithOptions(result: {
  current: ReturnType<typeof useLeagueSeasonCreateOrchestration>;
}) {
  await waitFor(() => {
    const v = result.current.view;
    expect(v.state === "ready" && v.fullOptions.state === "ready").toBe(true);
  });
  const view = result.current.view;
  if (view.state !== "ready") throw new Error("not ready");
  return view;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("offered season kinds", () => {
  it("offers both kinds, and loads awards seasons, to any commissioner", async () => {
    const calls = stubApi();
    const { result } = render();
    await waitFor(() => expect(result.current.view.state).toBe("ready"));
    const view = result.current.view;
    if (view.state !== "ready") throw new Error("not ready");
    expect(view.kindOrder).toEqual(["ceremony", "full"]);
    expect(calls.some((c) => c.path === "/circuits")).toBe(true);
  });
});

describe("creating a full awards season", () => {
  it("creates with the defaults in one request that names only the awards season", async () => {
    const calls = stubApi();
    const { result } = render();
    const view = await readyWithOptions(result);
    expect(view.fullCircuitId).toBe(6);
    expect(Object.keys(view.fullSettings.events)).toEqual(["60", "61"]);

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.actions.submitFull();
    });
    expect(outcome).toEqual({ ok: true, fullSeasonId: 4 });
    expect(calls.filter((c) => c.method === "POST")).toEqual([
      { method: "POST", path: "/leagues/3/circuits", body: { circuit_id: 6 } }
    ]);
  });

  it("sends applied settings, events and categories with the same request", async () => {
    const calls = stubApi();
    const { result } = render();
    const view = await readyWithOptions(result);
    act(() => {
      result.current.actions.applyFullArea("roster", {
        ...view.fullSettings,
        rosterSize: 10,
        categories: { 600: { weight: 1, maxOwned: 2 } }
      });
    });
    act(() => {
      const v = result.current.view;
      if (v.state !== "ready") return;
      result.current.actions.applyFullArea("events", {
        ...v.fullSettings,
        events: { 60: { enabled: true, weight: 1.5 }, 61: { enabled: false, weight: 1 } }
      });
    });
    await act(async () => {
      await result.current.actions.submitFull();
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      circuit_id: 6,
      settings: { roster_size: 10 },
      events: [{ circuit_event_id: 60, weight: 1.5 }],
      categories: [{ circuit_category_id: 600, weight: 1, max_owned: 2 }]
    });
  });

  it("puts events and categories back, and says so, when the awards season changes", async () => {
    stubApi();
    const { result } = render();
    const view = await readyWithOptions(result);
    act(() => {
      result.current.actions.applyFullArea("scoring", {
        ...view.fullSettings,
        nominationPoints: 3,
        categories: { 600: { weight: 2, maxOwned: null } }
      });
    });
    act(() => result.current.actions.setFullCircuitId(5));
    await waitFor(() => {
      const v = result.current.view;
      expect(
        v.state === "ready" && v.fullOptions.state === "ready" && v.fullCircuitId
      ).toBe(5);
    });
    const after = result.current.view;
    if (after.state !== "ready") throw new Error("not ready");
    expect(after.fullDiscarded).toBe(true);
    expect(after.fullSettings.nominationPoints).toBe(3);
    expect(after.fullSettings.categories).toEqual({ 500: { weight: 1, maxOwned: null } });
  });

  it("shows the forbidden state to a member who is not a commissioner", async () => {
    stubApi("MEMBER");
    const { result } = render();
    await waitFor(() => expect(result.current.view.state).toBe("forbidden"));
    expect(result.current.view).toEqual({
      state: "forbidden",
      message: "Only the league's commissioners can create seasons."
    });
  });
});
