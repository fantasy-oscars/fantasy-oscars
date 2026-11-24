import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const confirmMock = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
vi.mock("@/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/notifications")>()),
  confirm: confirmMock
}));

import {
  useAdminCeremonyCircuitOrchestration,
  useAdminCircuitDetailOrchestration
} from "@/orchestration/adminCircuit";

function json(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body)
  });
}

const category = (id: number, name: string, familyId: number | null) => ({
  id,
  circuit_id: 3,
  code: name.toLowerCase(),
  name,
  kind: "ACTING" as const,
  sort_index: id,
  category_family_id: familyId,
  icon_id: 1,
  icon_code: "film",
  icon_variant: "default"
});

const categoryEdition = (
  id: number,
  name: string,
  saved: number | null,
  suggested: number | null
) => ({
  id,
  ceremony_id: 8,
  code: null,
  name,
  sort_index: id,
  family_id: suggested === null ? null : 40,
  circuit_category_id: saved,
  suggested_circuit_category_id: suggested
});

const LEAGUE = { circuit_league_id: 4, name: "Friends League", status: "IN_SEASON" };

function detail(status: string, leagues: unknown[] = []) {
  return {
    circuit: {
      id: 3,
      code: "c-2027",
      name: "Awards Run 2027",
      status,
      opens_on: null,
      activated_at: null
    },
    events: [
      {
        id: 11,
        circuit_id: 3,
        code: "bafta",
        name: "BAFTA",
        sort_index: 0,
        is_group: false
      },
      {
        id: 12,
        circuit_id: 3,
        code: "guilds",
        name: "Guilds",
        sort_index: 1,
        is_group: true
      },
      // Left empty some other way; a reorder keeps it last.
      { id: 13, circuit_id: 3, code: "old", name: "Old", sort_index: 2, is_group: false }
    ],
    categories: [category(21, "Actor", 40), category(22, "Actress", 41)],
    ceremonies: [],
    category_editions: [
      // Golden Globes: both lead-actor categories come from the Actor template.
      categoryEdition(51, "Best Actor – Drama", null, 21),
      categoryEdition(52, "Best Actor – Musical or Comedy", null, 21),
      categoryEdition(53, "Best Actress – Drama", 22, 22)
    ],
    readiness: { missing_dates: [] },
    initialized_leagues: leagues,
    occasions: [],
    waiver_windows: []
  };
}

function stubFetch(
  circuitStatus: string,
  opts: { leagues?: unknown[]; refuseUnconfirmed?: boolean; seasonCount?: number } = {}
) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      calls.push({ url, method, body: init?.body as string | undefined });
      if (url.endsWith("/admin/circuits/3") && method === "GET")
        return json(detail(circuitStatus, opts.leagues));
      // The server refuses an edit that affects initialised leagues until confirmed.
      if (opts.refuseUnconfirmed && method !== "GET" && !url.includes("confirm=true"))
        return json(
          {
            error: {
              code: "CIRCUIT_EDIT_NEEDS_CONFIRMATION",
              message: "This change affects 1 initialised league. Confirm to continue.",
              details: { affected_leagues: [LEAGUE] }
            }
          },
          409
        );
      if (url.endsWith("/admin/ceremonies") && method === "GET")
        return json({
          ceremonies: [{ id: 7, code: "bafta", name: "BAFTA", starts_at: null }]
        });
      if (url.endsWith("/admin/category-families") && method === "GET")
        return json({
          families: [
            { id: 40, code: "actor", name: "Actor", default_unit_kind: "PERFORMANCE" },
            { id: 42, code: "song", name: "Song", default_unit_kind: "SONG" }
          ]
        });
      if (url.endsWith("/admin/circuits/3/publish"))
        return json({ circuit: detail("PUBLISHED").circuit });
      if (url.endsWith("/admin/circuits/3/unpublish"))
        return opts.seasonCount
          ? json(
              {
                error: {
                  code: "CIRCUIT_HAS_SEASONS",
                  message: `Remove the ${opts.seasonCount} seasons set up for this first`,
                  details: { season_count: opts.seasonCount }
                }
              },
              409
            )
          : json({ circuit: detail("DRAFT").circuit });
      if (url.endsWith("/admin/circuits/3/activate"))
        return json({
          circuit: detail("ACTIVE").circuit,
          readiness: {
            missing_dates: [
              {
                ceremony_id: 7,
                ceremony_code: "bafta",
                ceremony_name: "BAFTA",
                missing: ["results_on"]
              }
            ]
          }
        });
      if (url.endsWith("/admin/ceremonies/7/circuits") && method === "GET")
        return json({
          associations: [],
          circuits: [
            {
              id: 3,
              code: "c-2027",
              name: "Awards Run 2027",
              status: circuitStatus,
              events: detail(circuitStatus).events
            }
          ]
        });
      return json({});
    })
  );
  return calls;
}

const writes = (calls: Array<{ method: string }>) =>
  calls.filter((c) => c.method !== "GET");

async function renderDetail() {
  const hook = renderHook(() => useAdminCircuitDetailOrchestration({ circuitId: 3 }));
  await waitFor(() => expect(hook.result.current.state).toBe("ready"));
  return hook;
}

describe("Circuit admin orchestration", () => {
  afterEach(() => {
    cleanup();
    confirmMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("offers category templates without song templates", async () => {
    stubFetch("DRAFT");
    const { result } = await renderDetail();
    expect(result.current.templates.map((t) => t.id)).toEqual([40]);
  });

  it("adds a ceremony to a draft Circuit without asking, ungrouped", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.addCeremony(9);
    });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/circuits\/3\/ceremonies\/9$/),
        method: "PUT",
        body: JSON.stringify({})
      })
    ]);
  });

  it("adds, renames and deletes groups, and saves each drag as one write", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.addGroup(" Guild Awards ");
      await result.current.actions.renameGroup(12, "Guilds");
      // Into a group, out to the top level, and a top-level reorder.
      await result.current.actions.applyLayout({
        kind: "moveCeremony",
        ceremonyId: 7,
        groupId: 12,
        index: 0
      });
      await result.current.actions.applyLayout({
        kind: "moveCeremony",
        ceremonyId: 7,
        groupId: null,
        index: 1
      });
      await result.current.actions.applyLayout({
        kind: "reorderEvents",
        eventIds: [12, 11]
      });
      await result.current.actions.deleteGroup(12);
    });
    const sent = writes(calls);
    expect(sent.map((c) => [c.method, c.url.replace(/^.*\/admin/, "")])).toEqual([
      ["POST", "/circuits/3/events"],
      ["PATCH", "/circuits/3/events/12"],
      ["PUT", "/circuits/3/ceremonies/7/position"],
      ["PUT", "/circuits/3/ceremonies/7/position"],
      ["PUT", "/circuits/3/events/order"],
      ["DELETE", "/circuits/3/events/12"]
    ]);
    expect(sent[0]?.body).toBe(JSON.stringify({ name: "Guild Awards" }));
    expect(sent[2]?.body).toBe(JSON.stringify({ group_id: 12, index: 0 }));
    expect(sent[3]?.body).toBe(JSON.stringify({ group_id: null, index: 1 }));
    // The order lists every event; one not shown stays last.
    expect(sent[4]?.body).toBe(JSON.stringify({ event_ids: [12, 11, 13] }));
  });

  it("adds, renames, reorders and removes Circuit categories", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.addCategory(40);
      await result.current.actions.renameCategory(21, "Lead Actor");
      await result.current.actions.reorderCategories([22, 21]);
      await result.current.actions.removeCategory(22);
    });
    const sent = writes(calls);
    expect(sent.map((c) => [c.method, c.url.replace(/^.*\/admin/, "")])).toEqual([
      ["POST", "/circuits/3/categories"],
      ["PATCH", "/circuits/3/categories/21"],
      ["PUT", "/circuits/3/categories/order"],
      ["DELETE", "/circuits/3/categories/22"]
    ]);
    expect(sent[0]?.body).toBe(JSON.stringify({ category_family_id: 40 }));
    expect(sent[2]?.body).toBe(JSON.stringify({ category_ids: [22, 21] }));
  });

  it("saves one ceremony's mapping choices, template matches included", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      // The modal's choices: Actress cleared; the template matches stand.
      await result.current.actions.saveMappings(8, { 53: null });
    });
    // Both Golden Globes lead-actor categories map to Actor; the cleared
    // Actress mapping is removed.
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/circuits\/3\/mappings\/51$/),
        method: "PUT",
        body: JSON.stringify({ circuit_category_id: 21 })
      }),
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/circuits\/3\/mappings\/52$/),
        method: "PUT",
        body: JSON.stringify({ circuit_category_id: 21 })
      }),
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/circuits\/3\/mappings\/53$/),
        method: "DELETE"
      })
    ]);
  });

  it("saves nothing for a ceremony whose mappings already match", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.saveMappings(99, {});
    });
    expect(writes(calls)).toEqual([]);
  });

  it("asks before a structural edit on an active Circuit and stops when declined", async () => {
    const calls = stubFetch("ACTIVE");
    confirmMock.mockResolvedValue(false);
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.saveMappings(8, {});
      await result.current.actions.removeCeremony(7);
      await result.current.actions.addCategory(40);
      await result.current.actions.deleteGroup(12);
      await result.current.actions.applyLayout({
        kind: "moveCeremony",
        ceremonyId: 7,
        groupId: 12,
        index: 0
      });
    });
    expect(confirmMock).toHaveBeenCalledTimes(5);
    expect(writes(calls)).toEqual([]);
  });

  it("renames without asking, even on an active Circuit", async () => {
    const calls = stubFetch("ACTIVE");
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.renameCategory(21, "Lead Actor");
    });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(writes(calls)).toHaveLength(1);
  });

  it("keeps the ceremonies that lack dates from the activation response", async () => {
    stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.activate();
    });
    expect(result.current.activationMissing).toEqual([
      expect.objectContaining({ ceremony_id: 7, missing: ["results_on"] })
    ]);
  });

  it("publishes without asking", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      expect(await result.current.actions.publish()).toBe(true);
    });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/circuits\/3\/publish$/),
        method: "POST"
      })
    ]);
  });

  it("withdraws only after the admin confirms", async () => {
    const calls = stubFetch("PUBLISHED");
    confirmMock.mockResolvedValue(false);
    const { result } = await renderDetail();
    await act(async () => {
      expect(await result.current.actions.withdraw()).toBe(false);
    });
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ confirmLabel: "Withdraw", danger: true })
    );
    expect(writes(calls)).toEqual([]);

    confirmMock.mockResolvedValue(true);
    await act(async () => {
      expect(await result.current.actions.withdraw()).toBe(true);
    });
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/circuits\/3\/unpublish$/),
        method: "POST"
      })
    ]);
    expect(result.current.status).toBeNull();
  });

  it("shows the server's refusal when seasons are set up", async () => {
    stubFetch("PUBLISHED", { seasonCount: 2 });
    confirmMock.mockResolvedValue(true);
    const { result } = await renderDetail();
    await act(async () => {
      expect(await result.current.actions.withdraw()).toBe(false);
    });
    expect(result.current.status).toEqual({
      ok: false,
      message: "Remove the 2 seasons set up for this first"
    });
  });

  it("attaches from the ceremony side, with no event to choose", async () => {
    const calls = stubFetch("ACTIVE");
    confirmMock.mockResolvedValue(true);
    const { result } = renderHook(() =>
      useAdminCeremonyCircuitOrchestration({ ceremonyId: 7 })
    );
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current).not.toHaveProperty("datesForm");

    await act(async () => {
      await result.current.actions.associate(3);
    });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/ceremonies\/7\/circuits\/3\?confirm=true$/),
        method: "PUT",
        body: undefined
      })
    ]);
  });

  describe("changes that affect initialised leagues", () => {
    const confirmedText = () =>
      (confirmMock.mock.calls[0] as unknown as [{ message: string }])[0].message;

    it("names the leagues in the confirmation, even on a draft Circuit, and sends it", async () => {
      const calls = stubFetch("DRAFT", { leagues: [LEAGUE] });
      confirmMock.mockResolvedValue(true);
      const { result } = await renderDetail();
      await act(async () => {
        await result.current.actions.removeCeremony(7);
      });
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(confirmedText()).toContain("1 initialised league");
      expect(confirmedText()).toContain("Friends League");
      expect(writes(calls)).toEqual([
        expect.objectContaining({
          url: expect.stringMatching(
            /\/admin\/circuits\/3\/ceremonies\/7\?confirm=true$/
          ),
          method: "DELETE"
        })
      ]);
    });

    it("sends the mapping saves with the confirmation", async () => {
      const calls = stubFetch("DRAFT", { leagues: [LEAGUE] });
      confirmMock.mockResolvedValue(true);
      const { result } = await renderDetail();
      await act(async () => {
        await result.current.actions.saveMappings(8, {});
      });
      expect(confirmedText()).toContain("Friends League");
      const sent = writes(calls);
      expect(sent.length).toBeGreaterThan(0);
      for (const call of sent) expect(call.url).toMatch(/\?confirm=true$/);
    });

    it("on the ceremony screen, learns the leagues from the server's refusal, then asks and retries", async () => {
      const calls = stubFetch("DRAFT", { refuseUnconfirmed: true });
      confirmMock.mockResolvedValue(true);
      const { result } = renderHook(() =>
        useAdminCeremonyCircuitOrchestration({ ceremonyId: 7 })
      );
      await waitFor(() => expect(result.current.state).toBe("ready"));
      await act(async () => {
        await result.current.actions.associate(3);
      });
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(confirmedText()).toContain("Friends League");
      expect(writes(calls).map((c) => c.url.replace(/^.*\/admin/, "/admin"))).toEqual([
        "/admin/ceremonies/7/circuits/3",
        "/admin/ceremonies/7/circuits/3?confirm=true"
      ]);
    });

    it("stops when the admin declines the server's confirmation", async () => {
      const calls = stubFetch("DRAFT", { refuseUnconfirmed: true });
      confirmMock.mockResolvedValue(false);
      const { result } = renderHook(() =>
        useAdminCeremonyCircuitOrchestration({ ceremonyId: 7 })
      );
      await waitFor(() => expect(result.current.state).toBe("ready"));
      await act(async () => {
        await result.current.actions.associate(3);
      });
      expect(writes(calls)).toHaveLength(1);
      expect(result.current.associationStatus).toBeNull();
    });
  });
});
