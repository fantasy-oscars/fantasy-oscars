import type { ReactNode } from "react";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { MantineProvider } from "@ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "@/lib/api";
import { LazyRoute, isChunkLoadError } from "@/app/LazyRoute";
import { createQueryClient } from "@/orchestration/query/client";
import { queryKeys } from "@/orchestration/query/keys";
import { registerWriteInvalidation } from "@/orchestration/query/invalidate";
import { useAuthSessionOrchestration } from "@/orchestration/auth/sessionOrchestration";

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

function seed(client: QueryClient) {
  client.setQueryData(queryKeys.ceremonies.detail(1), { ceremony: { id: 1 } });
  client.setQueryData(queryKeys.seasons.detail(2, null), { members: [] });
  client.setQueryData(queryKeys.leagues.detail(3), { league: { id: 3 } });
}

function stale(client: QueryClient, key: readonly unknown[]) {
  return client.getQueryState(key)?.isInvalidated === true;
}

describe("cache freshness after writes", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("marks ceremony, season and league reads stale after an admin write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json({}))
    );
    const client = createQueryClient();
    seed(client);
    const stop = registerWriteInvalidation(client);

    await fetchJson("/admin/ceremonies/1/winners", { method: "POST" });

    expect(stale(client, queryKeys.ceremonies.detail(1))).toBe(true);
    expect(stale(client, queryKeys.seasons.detail(2, null))).toBe(true);
    expect(stale(client, queryKeys.leagues.detail(3))).toBe(true);
    stop();
  });

  it("marks reads stale after a draft start but not after a plain read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json({}))
    );
    const client = createQueryClient();
    seed(client);
    const stop = registerWriteInvalidation(client);

    await fetchJson("/ceremonies/1", { method: "GET" });
    expect(stale(client, queryKeys.ceremonies.detail(1))).toBe(false);

    await fetchJson("/drafts/7/start", { method: "POST" });
    expect(stale(client, queryKeys.seasons.detail(2, null))).toBe(true);
    expect(stale(client, queryKeys.ceremonies.detail(1))).toBe(true);
    stop();
  });

  it("drops the previous user's cache when /auth/me returns a different user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json({ user: { sub: "2", username: "bob" } }))
    );
    const client = createQueryClient();
    client.setQueryData(queryKeys.auth.me(), { sub: "1", username: "alice" });
    client.setQueryData(queryKeys.leagues.list(), [{ id: 1 }]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAuthSessionOrchestration(), { wrapper });
    expect(result.current.user?.sub).toBe("1");
    await client.invalidateQueries({ queryKey: queryKeys.auth.me() });
    await waitFor(() => expect(result.current.user?.sub).toBe("2"));
    await waitFor(() =>
      expect(client.getQueryData(queryKeys.leagues.list())).toBeUndefined()
    );
  });
});

describe("lazy route error boundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("recognises chunk load failures", () => {
    expect(
      isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: x"))
    ).toBe(true);
    expect(isChunkLoadError(new Error("boom"))).toBe(false);
  });

  it("offers a reload instead of a blank page when a route fails to load", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): ReactNode {
      throw new Error("Failed to fetch dynamically imported module");
    }
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    window.sessionStorage.setItem("fo:chunk-reload", "1");

    render(
      <MantineProvider>
        <LazyRoute>
          <Broken />
        </LazyRoute>
      </MantineProvider>
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/newer version/i);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
