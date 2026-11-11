import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDraftSnapshot } from "@/orchestration/draft/useDraftSnapshot";
import * as api from "@/lib/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDraftSnapshot", () => {
  it("loads once after a failed fetch and keeps the error", async () => {
    const fetchJson = vi
      .spyOn(api, "fetchJson")
      .mockResolvedValue({ ok: false, error: "Draft not found" } as never);

    const { result } = renderHook(() => useDraftSnapshot({ draftId: "99999" }));

    await waitFor(() => expect(result.current.error).toBe("Draft not found"));
    // Give any re-run of the load effect time to fire.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.snapshot).toBeNull();
  });

  it("an explicit retry loads again", async () => {
    const fetchJson = vi
      .spyOn(api, "fetchJson")
      .mockResolvedValue({ ok: false, error: "boom" } as never);

    const { result } = renderHook(() => useDraftSnapshot({ draftId: "7" }));
    await waitFor(() => expect(result.current.error).toBe("boom"));

    await act(async () => {
      await result.current.loadSnapshot();
    });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });
});
