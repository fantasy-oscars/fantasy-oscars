import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminCeremonyCategoriesOrchestration } from "@/orchestration/adminCeremoniesCategories";
import { useAdminCeremonyWinnersOrchestration } from "@/orchestration/adminCeremonies";

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

function stubCeremony(status: string, resultsFinalizedAt: string | null = null) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.endsWith("/admin/ceremonies/4/categories")) {
        return json({ ceremony: { status }, categories: [] });
      }
      if (url.endsWith("/admin/ceremonies/4/lock")) {
        return json({
          status,
          draft_locked: status === "LOCKED",
          draft_locked_at: null,
          results_finalized_at: resultsFinalizedAt
        });
      }
      return json({});
    })
  );
}

describe("admin ceremony screens follow the lifecycle", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ["DRAFT", true],
    ["PUBLISHED", true],
    ["ACTIVE", false],
    ["LOCKED", false],
    ["ARCHIVED", false]
  ])("categories in %s are editable: %s", async (status, editable) => {
    stubCeremony(status);
    const { result } = renderHook(() =>
      useAdminCeremonyCategoriesOrchestration({ ceremonyId: 4 })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canEdit).toBe(editable);
  });

  it.each([
    ["PUBLISHED", null, "Published"],
    ["ACTIVE", null, "Open for leagues"],
    ["LOCKED", null, "Results in progress"],
    ["LOCKED", "2027-03-15T05:00:00.000Z", "Results final"]
  ])("winners show %s (finalized %s) as %s", async (status, finalizedAt, label) => {
    stubCeremony(status, finalizedAt);
    const { result } = renderHook(() =>
      useAdminCeremonyWinnersOrchestration({ ceremonyId: 4 })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ceremonyStatusText).toBe(label);
  });
});
