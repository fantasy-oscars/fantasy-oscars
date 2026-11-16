import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const confirmMock = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
vi.mock("@/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/notifications")>()),
  confirm: confirmMock
}));

import {
  useAdminCeremonySeriesOrchestration,
  useAdminSeriesDetailOrchestration
} from "@/orchestration/adminSeries";

function json(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body)
  });
}

function detail(status: string) {
  return {
    series: {
      id: 3,
      code: "s-2027",
      name: "Season 2027",
      status,
      opens_on: null,
      activated_at: null
    },
    events: [{ id: 11, series_id: 3, code: "BAFTA", name: "BAFTA", sort_index: 3 }],
    categories: [],
    ceremonies: [],
    category_editions: [],
    readiness: { missing_dates: [] },
    occasions: []
  };
}

function stubFetch(seriesStatus: string) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      calls.push({ url, method, body: init?.body as string | undefined });
      if (url.endsWith("/admin/series/3") && method === "GET")
        return json(detail(seriesStatus));
      if (url.endsWith("/admin/ceremonies") && method === "GET")
        return json({
          ceremonies: [{ id: 7, code: "bafta", name: "BAFTA", starts_at: null }]
        });
      if (url.endsWith("/admin/series/3/activate"))
        return json({
          series: detail("ACTIVE").series,
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
      if (url.endsWith("/admin/ceremonies/7/series") && method === "GET")
        return json({
          associations: [],
          series: [
            {
              id: 3,
              code: "s-2027",
              name: "Season 2027",
              status: seriesStatus,
              events: detail(seriesStatus).events
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
      return json({ associations: [] });
    })
  );
  return calls;
}

const writes = (calls: Array<{ method: string }>) =>
  calls.filter((c) => c.method !== "GET");

describe("Series admin orchestration", () => {
  afterEach(() => {
    cleanup();
    confirmMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("adds a ceremony to a draft Series without asking", async () => {
    const calls = stubFetch("DRAFT");
    const { result } = renderHook(() =>
      useAdminSeriesDetailOrchestration({ seriesId: 3 })
    );
    await waitFor(() => expect(result.current.state).toBe("ready"));
    await act(async () => {
      await result.current.actions.associate(7, 11);
    });
    expect(confirmMock).not.toHaveBeenCalled();
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/series\/3\/ceremonies\/7$/),
        method: "PUT",
        body: JSON.stringify({ series_event_id: 11 })
      })
    ]);
  });

  it("asks before a structural edit on an active Series and stops when declined", async () => {
    const calls = stubFetch("ACTIVE");
    confirmMock.mockResolvedValue(false);
    const { result } = renderHook(() =>
      useAdminSeriesDetailOrchestration({ seriesId: 3 })
    );
    await waitFor(() => expect(result.current.state).toBe("ready"));
    await act(async () => {
      await result.current.actions.setMapping(5, 2);
      await result.current.actions.remove(7);
    });
    expect(confirmMock).toHaveBeenCalledTimes(2);
    expect(writes(calls)).toEqual([]);
  });

  it("clears a mapping with DELETE once confirmed", async () => {
    const calls = stubFetch("ACTIVE");
    confirmMock.mockResolvedValue(true);
    const { result } = renderHook(() =>
      useAdminSeriesDetailOrchestration({ seriesId: 3 })
    );
    await waitFor(() => expect(result.current.state).toBe("ready"));
    await act(async () => {
      await result.current.actions.setMapping(5, null);
    });
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/series\/3\/mappings\/5$/),
        method: "DELETE"
      })
    ]);
  });

  it("keeps the ceremonies that lack dates from the activation response", async () => {
    stubFetch("DRAFT");
    const { result } = renderHook(() =>
      useAdminSeriesDetailOrchestration({ seriesId: 3 })
    );
    await waitFor(() => expect(result.current.state).toBe("ready"));
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
      useAdminCeremonySeriesOrchestration({ ceremonyId: 7 })
    );
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.datesForm).toEqual({
      nominationsOn: "2027-01-08",
      resultsOn: ""
    });

    act(() => result.current.setDatesForm((p) => ({ ...p, resultsOn: "2027-02-16" })));
    await act(async () => {
      await result.current.actions.saveDates();
      await result.current.actions.associate(3, 11);
    });
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/ceremonies\/7\/dates$/),
        method: "PATCH",
        body: JSON.stringify({ nominations_on: "2027-01-08", results_on: "2027-02-16" })
      }),
      expect.objectContaining({
        url: expect.stringMatching(/\/admin\/ceremonies\/7\/series\/3$/),
        method: "PUT",
        body: JSON.stringify({ series_event_id: 11 })
      })
    ]);
  });
});
