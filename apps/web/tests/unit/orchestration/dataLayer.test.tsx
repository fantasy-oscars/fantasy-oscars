import type { ReactNode } from "react";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageError } from "@/shared/page-state";
import { createQueryClient, shouldRetryQuery } from "@/orchestration/query/client";
import { ApiQueryError } from "@/orchestration/query/errors";
import { useCeremonyDetailOrchestration } from "@/orchestration/ceremonies";
import { useLeagueDetailOrchestration } from "@/orchestration/leagues";

function json(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body)
  });
}

function wrapperFor(client = createQueryClient()) {
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  };
}

const ceremonyBody = {
  ceremony: { id: 5, code: "o", name: "Oscars", starts_at: null, status: "PUBLISHED" },
  categories: [],
  nominations: [],
  winners: []
};

describe("web data layer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("serves a revisited ceremony page from cache without a loading state", async () => {
    const fetchMock = vi.fn(() => json(ceremonyBody));
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = wrapperFor();

    const first = renderHook(() => useCeremonyDetailOrchestration({ ceremonyId: 5 }), {
      wrapper
    });
    expect(first.result.current.state).toBe("loading");
    await waitFor(() => expect(first.result.current.state).toBe("ready"));
    first.unmount();

    const second = renderHook(() => useCeremonyDetailOrchestration({ ceremonyId: 5 }), {
      wrapper
    });
    // Rendered straight from the cache on the first render.
    expect(second.result.current.state).toBe("ready");
    expect(second.result.current.detail?.ceremony.name).toBe("Oscars");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent mounts of the same key", async () => {
    const fetchMock = vi.fn(() => json(ceremonyBody));
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = wrapperFor();

    const a = renderHook(() => useCeremonyDetailOrchestration({ ceremonyId: 5 }), {
      wrapper
    });
    const b = renderHook(() => useCeremonyDetailOrchestration({ ceremonyId: 5 }), {
      wrapper
    });
    await waitFor(() => expect(a.result.current.state).toBe("ready"));
    await waitFor(() => expect(b.result.current.state).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders a revisited league from cache and reuses its sub-requests", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/leagues/9/seasons")) return json({ seasons: [] });
      if (url.endsWith("/leagues/9/members")) {
        return json({
          members: [{ id: 1, user_id: 1, role: "OWNER", username: "alice" }]
        });
      }
      if (url.endsWith("/leagues/9")) {
        return json({ league: { id: 9, code: "l", name: "L", ceremony_id: null } });
      }
      return json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = wrapperFor();

    const first = renderHook(
      () => useLeagueDetailOrchestration({ leagueId: 9, userSub: "1" }),
      { wrapper }
    );
    await waitFor(() => expect(first.result.current.view.state).toBe("ready"));
    first.unmount();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const second = renderHook(
      () => useLeagueDetailOrchestration({ leagueId: 9, userSub: "1" }),
      { wrapper }
    );
    expect(second.result.current.view.state).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("carries the request id on failed loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          headers: {
            get: (name: string) => (name === "x-request-id" ? "req-abc" : null)
          },
          json: () =>
            Promise.resolve({ error: { code: "FORBIDDEN", message: "Forbidden" } })
        })
      )
    );
    const { wrapper } = wrapperFor();
    const { result } = renderHook(
      () => useLeagueDetailOrchestration({ leagueId: 9, userSub: "1" }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.view.state).toBe("forbidden"));
    const view = result.current.view;
    expect(view.state === "forbidden" && view.requestId).toBe("req-abc");
  });

  it("PageError shows a Reference line only when a request id is present", () => {
    const { rerender } = render(
      <MantineProvider>
        <PageError message="Boom" requestId="req-123" />
      </MantineProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    expect(screen.getByText("Reference: req-123")).toBeInTheDocument();

    rerender(
      <MantineProvider>
        <PageError message="Boom" />
      </MantineProvider>
    );
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });

  it("does not retry 4xx failures but retries a transient one once", () => {
    expect(shouldRetryQuery(0, new ApiQueryError("x", { status: 404 }))).toBe(false);
    expect(shouldRetryQuery(0, new ApiQueryError("x", { status: 503 }))).toBe(true);
    expect(shouldRetryQuery(0, new ApiQueryError("x"))).toBe(true);
    expect(shouldRetryQuery(1, new ApiQueryError("x", { status: 503 }))).toBe(false);
  });
});
