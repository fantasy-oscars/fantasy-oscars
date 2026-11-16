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

function detail(status: string) {
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
      { id: 11, circuit_id: 3, code: "bafta", name: "BAFTA", sort_index: 0 },
      { id: 12, circuit_id: 3, code: "guilds", name: "Guilds", sort_index: 1 }
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
    occasions: []
  };
}

function stubFetch(circuitStatus: string) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      calls.push({ url, method, body: init?.body as string | undefined });
      if (url.endsWith("/admin/circuits/3") && method === "GET")
        return json(detail(circuitStatus));
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
      if (url.endsWith("/admin/ceremonies/7") && method === "GET")
        return json({
          ceremony: { id: 7, nominations_on: "2027-01-08", results_on: null }
        });
      if (url.endsWith("/admin/ceremonies/7/dates"))
        return json({
          ceremony: { nominations_on: "2027-01-08", results_on: "2027-02-16" }
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

  it("adds a ceremony to a draft Circuit without asking, with or without an event", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.placeCeremony(7, 11);
      await result.current.actions.placeCeremony(9, null);
    });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/circuits\/3\/ceremonies\/7$/),
        method: "PUT",
        body: JSON.stringify({ circuit_event_id: 11 })
      }),
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/circuits\/3\/ceremonies\/9$/),
        method: "PUT",
        body: JSON.stringify({ circuit_event_id: null })
      })
    ]);
  });

  it("groups ceremonies, renames, reorders and ungroups events", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.createEvent(" Guilds ", [7, 9]);
      await result.current.actions.renameEvent(11, "BAFTA Film Awards");
      await result.current.actions.moveEvent(12, -1);
      await result.current.actions.moveEvent(11, -1); // already first: no write
      await result.current.actions.ungroupEvent(12);
    });
    expect(writes(calls).map((c) => [c.method, c.url.replace(/^.*\/admin/, "")])).toEqual(
      [
        ["POST", "/circuits/3/events"],
        ["PATCH", "/circuits/3/events/11"],
        ["PUT", "/circuits/3/events/order"],
        ["DELETE", "/circuits/3/events/12"]
      ]
    );
    expect(writes(calls)[0]?.body).toBe(
      JSON.stringify({ name: "Guilds", ceremony_ids: [7, 9] })
    );
    expect(writes(calls)[2]?.body).toBe(JSON.stringify({ event_ids: [12, 11] }));
  });

  it("adds, renames, reorders and removes Circuit categories", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.addCategory(40);
      await result.current.actions.renameCategory(21, "Lead Actor");
      await result.current.actions.moveCategory(21, 1);
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

  it("pre-selects mappings by template and saves nothing until the admin saves", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = await renderDetail();
    act(() => result.current.actions.chooseMapping(53, null));
    // Choosing and the template pre-selection send no request.
    expect(writes(calls)).toEqual([]);

    await act(async () => {
      await result.current.actions.saveMappings();
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
    expect(result.current.mappingChoices).toEqual({});
  });

  it("asks before a structural edit on an active Circuit and stops when declined", async () => {
    const calls = stubFetch("ACTIVE");
    confirmMock.mockResolvedValue(false);
    const { result } = await renderDetail();
    await act(async () => {
      await result.current.actions.saveMappings();
      await result.current.actions.removeCeremony(7);
      await result.current.actions.addCategory(40);
      await result.current.actions.ungroupEvent(12);
    });
    expect(confirmMock).toHaveBeenCalledTimes(4);
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

  it("loads and saves a ceremony's dates, and associates from the ceremony side", async () => {
    const calls = stubFetch("ACTIVE");
    confirmMock.mockResolvedValue(true);
    const { result } = renderHook(() =>
      useAdminCeremonyCircuitOrchestration({ ceremonyId: 7 })
    );
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.datesForm).toEqual({
      nominationsOn: "2027-01-08",
      resultsOn: ""
    });

    act(() => result.current.setDatesForm((p) => ({ ...p, resultsOn: "2027-02-16" })));
    await act(async () => {
      await result.current.actions.saveDates();
      await result.current.actions.associate(3, null);
    });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/ceremonies\/7\/dates$/),
        method: "PATCH",
        body: JSON.stringify({ nominations_on: "2027-01-08", results_on: "2027-02-16" })
      }),
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/ceremonies\/7\/circuits\/3$/),
        method: "PUT",
        body: JSON.stringify({ circuit_event_id: null })
      })
    ]);
  });
});
