import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/orchestration/query/client";
import { useSeasonOrchestration } from "@/orchestration/seasons";

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

function stubApi(role: string) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/seasons/7/members")) {
        return json({
          members: [
            { id: 1, season_id: 7, user_id: 5, league_member_id: 1, role, joined_at: "" }
          ]
        });
      }
      if (url.endsWith("/leagues")) {
        return json({
          leagues: [{ id: 3, code: "l", name: "League", ceremony_id: 1 }]
        });
      }
      if (url.endsWith("/leagues/3/seasons")) {
        return json({ seasons: [{ id: 7, ceremony_id: 1, status: "EXTANT" }] });
      }
      if (url.endsWith("/ceremonies")) return json({ ceremonies: [] });
      if (url.endsWith("/leagues/3/members")) return json({ members: [] });
      if (url.endsWith("/seasons/7/invites")) return json({ invites: [] });
      return json({});
    })
  );
  return urls;
}

function render(opts: { isSuperAdmin?: boolean } = {}) {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSeasonOrchestration(7, "5", opts), { wrapper });
}

describe("season page commissioner-only requests", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not request invites or league members for a plain member", async () => {
    const urls = stubApi("MEMBER");
    const { result } = render();
    await waitFor(() => expect(result.current.leagueContext).not.toBeNull());
    expect(urls.some((u) => u.endsWith("/seasons/7/invites"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/leagues/3/members"))).toBe(false);
  });

  it("requests both for a season owner", async () => {
    const urls = stubApi("OWNER");
    const { result } = render();
    await waitFor(() => expect(result.current.leagueContext).not.toBeNull());
    expect(urls.some((u) => u.endsWith("/seasons/7/invites"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/leagues/3/members"))).toBe(true);
  });

  it("requests both for a super admin who is only a member", async () => {
    const urls = stubApi("MEMBER");
    const { result } = render({ isSuperAdmin: true });
    await waitFor(() => expect(result.current.leagueContext).not.toBeNull());
    expect(urls.some((u) => u.endsWith("/seasons/7/invites"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/leagues/3/members"))).toBe(true);
  });
});
