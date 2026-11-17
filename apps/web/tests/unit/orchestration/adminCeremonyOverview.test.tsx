import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminCeremonyOverviewOrchestration } from "@/orchestration/adminCeremonies";

function json(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

const CEREMONY = {
  id: 7,
  code: "bafta",
  name: "BAFTA",
  starts_at: "2027-02-15T03:00:00.000Z",
  nominations_on: "2027-01-15",
  status: "PUBLISHED",
  draft_warning_hours: 24,
  draft_locked_at: null,
  published_at: null,
  archived_at: null,
  results_finalized_at: null
};

function stubFetch(datesStatus = 200) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      calls.push({ url, method, body: init?.body as string | undefined });
      if (url.endsWith("/admin/ceremonies/7/dates"))
        return json(
          datesStatus < 400
            ? { ceremony: { nominations_on: "2027-01-20" } }
            : {
                error: {
                  code: "VALIDATION_ERROR",
                  message: "Enter the nominations date as YYYY-MM-DD",
                  details: { fields: ["nominations_on"] }
                }
              },
          datesStatus
        );
      return json({
        ceremony: CEREMONY,
        stats: {
          categories_total: 0,
          categories_with_nominees: 0,
          nominees_total: 0,
          winners_total: 0
        }
      });
    })
  );
  return calls;
}

const writes = (calls: Array<{ method: string }>) =>
  calls.filter((c) => c.method !== "GET");

async function renderOverview() {
  const hook = renderHook(() => useAdminCeremonyOverviewOrchestration({ ceremonyId: 7 }));
  await waitFor(() => expect(hook.result.current.ceremony).not.toBeNull());
  return hook;
}

describe("ceremony details orchestration", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the nominations date into the one date section", async () => {
    stubFetch();
    const { result } = await renderOverview();
    expect(result.current.form.nominationsOn).toBe("2027-01-15");
  });

  it("saves the ceremony datetime, and the nominations date only when it changed", async () => {
    const calls = stubFetch();
    const { result } = await renderOverview();
    await act(async () => {
      await result.current.actions.save();
    });
    expect(writes(calls).map((c) => c.url.replace(/^.*\/admin/, ""))).toEqual([
      "/ceremonies/7"
    ]);
    expect(JSON.parse(writes(calls)[0]!.body!)).not.toHaveProperty("results_on");

    act(() => result.current.setForm((p) => ({ ...p, nominationsOn: "2027-01-20" })));
    await act(async () => {
      await result.current.actions.save();
    });
    const sent = writes(calls).slice(1);
    expect(sent.map((c) => [c.method, c.url.replace(/^.*\/admin/, "")])).toEqual([
      ["PATCH", "/ceremonies/7"],
      ["PATCH", "/ceremonies/7/dates"]
    ]);
    expect(sent[1]!.body).toBe(JSON.stringify({ nominations_on: "2027-01-20" }));
  });

  it("puts a refused nominations date on its input", async () => {
    stubFetch(400);
    const { result } = await renderOverview();
    act(() => result.current.setForm((p) => ({ ...p, nominationsOn: "" })));
    await act(async () => {
      await result.current.actions.save();
    });
    expect(result.current.fieldErrors.nominationsOn).toBe(
      "Enter the nominations date as YYYY-MM-DD"
    );
    expect(result.current.status).toEqual(expect.objectContaining({ ok: false }));
  });
});
