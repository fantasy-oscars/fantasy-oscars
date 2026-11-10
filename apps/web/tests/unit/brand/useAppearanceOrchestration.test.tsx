import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAND_IDS,
  DARK_MODE,
  LIGHT_MODE,
  type BrandId
} from "@fantasy-oscars/shared/brands";
import type { AuthUser } from "@/auth/context";
import type { AppearancePatch } from "@/decisions/appearance";
import { queryKeys } from "@/orchestration/query/keys";
import { useAppearanceOrchestration } from "@/orchestration/account/useAppearanceOrchestration";
import type { SaveOutcome } from "@/orchestration/brand/appearanceSaveQueue";

const NOON = new Date(2026, 4, 5, 12, 0);

function account(over: Partial<AuthUser> = {}): AuthUser {
  return {
    sub: "7",
    brand_preference: null,
    appearance: {
      mode_preference: "theme",
      random_excluded_brands: [],
      undiscovered_enabled: true,
      single_mode_policy: "own",
      discovered_brands: ["ballot", "noir"],
      daily_draw: null
    },
    ...over
  };
}

function setup(
  initial: AuthUser,
  send: (patch: AppearancePatch) => Promise<SaveOutcome>,
  currentBrand: BrandId = "ballot"
) {
  const client = new QueryClient();
  client.setQueryData(queryKeys.auth.me(), initial);
  const show = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => {
      const { data } = useQuery<AuthUser | null>({
        queryKey: queryKeys.auth.me(),
        queryFn: async () => initial,
        staleTime: Infinity
      });
      return useAppearanceOrchestration({
        user: data ?? initial,
        currentBrand,
        show,
        enabled: BRAND_IDS,
        now: () => NOON,
        send
      });
    },
    { wrapper }
  );
  return { ...hook, client, show };
}

const saved = (user: AuthUser, patch: Record<string, unknown>) => ({
  ok: true as const,
  saved: {
    brand_preference:
      "brand_preference" in patch
        ? (patch.brand_preference as string | null)
        : (user.brand_preference ?? null),
    appearance: { ...(user.appearance ?? {}), ...patch }
  }
});

describe("useAppearanceOrchestration", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("a Mode change shows at once, saves, updates the session and the snapshot", async () => {
    const user = account();
    const send = vi.fn(async () => saved(user, { mode_preference: "dark" }));
    const { result, show, client } = setup(user, send);

    expect(result.current.view.mode.value).toBe("theme");
    act(() => result.current.change({ kind: "mode", mode: "dark" }));

    expect(show).toHaveBeenCalledWith("ballot", DARK_MODE);
    expect(result.current.view.mode.value).toBe("dark");
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(send).toHaveBeenCalledWith({ mode_preference: "dark" });
    expect(
      (client.getQueryData(queryKeys.auth.me()) as AuthUser).appearance?.mode_preference
    ).toBe("dark");
    const snapshot = JSON.parse(window.localStorage.getItem("fo:account-appearance")!);
    expect(snapshot.identity).toBe("user:7");
    expect(snapshot.appearance.mode_preference).toBe("dark");
  });

  it("shows Saving… while a request is in flight", async () => {
    const user = account();
    let finish!: (outcome: SaveOutcome) => void;
    const send = vi.fn(
      () =>
        new Promise<SaveOutcome>((resolve) => {
          finish = resolve;
        })
    );
    const { result } = setup(user, send);
    act(() => result.current.change({ kind: "policy", policy: "exclude" }));
    expect(result.current.status).toBe("saving");
    await act(async () => finish(saved(user, { single_mode_policy: "exclude" })));
    expect(result.current.status).toBe("saved");
  });

  it("a failed save puts the saved values back, on the page too, and Retry sends it again", async () => {
    const user = account();
    const send = vi
      .fn<(patch: AppearancePatch) => Promise<SaveOutcome>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(saved(user, { mode_preference: "dark" }));
    const { result, show } = setup(user, send);

    act(() => result.current.change({ kind: "mode", mode: "dark" }));
    expect(show).toHaveBeenLastCalledWith("ballot", DARK_MODE);

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.view.mode.value).toBe("theme");
    // Ballot's saved mode is Theme default, which is light.
    expect(show).toHaveBeenLastCalledWith("ballot", LIGHT_MODE);
    expect(result.current.status).toBe("idle");

    act(() => result.current.retry());
    expect(show).toHaveBeenLastCalledWith("ballot", DARK_MODE);
    expect(result.current.view.mode.value).toBe("dark");
    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(send).toHaveBeenLastCalledWith({ mode_preference: "dark" });
  });

  it("a failed Random-list save reverts the list without repainting", async () => {
    const user = account();
    const send = vi.fn<(patch: AppearancePatch) => Promise<SaveOutcome>>(async () => ({
      ok: false
    }));
    const { result, show } = setup(user, send);

    act(() =>
      result.current.change({
        kind: "random-list",
        value: ["undiscovered", "refined-gold", "ballot"]
      })
    );
    expect(result.current.view.random?.value).not.toContain("noir");
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.view.random?.value).toContain("noir");
    expect(show).not.toHaveBeenCalled();
  });

  it("a Random-list change waits for the next draw: no repaint", async () => {
    const user = account();
    const send = vi.fn(async (patch: AppearancePatch) => saved(user, { ...patch }));
    const { result, show } = setup(user, send);
    act(() =>
      result.current.change({
        kind: "random-list",
        value: ["undiscovered", "refined-gold", "ballot"]
      })
    );
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(show).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ random_excluded_brands: ["noir"] });
  });

  it("the floor: removing the last option sends nothing", () => {
    const user = account({
      appearance: { ...account().appearance, discovered_brands: [] }
    });
    const send = vi.fn<(patch: AppearancePatch) => Promise<SaveOutcome>>(async () => ({
      ok: false
    }));
    const { result } = setup(user, send);
    act(() =>
      result.current.change({
        kind: "random-list",
        value: ["undiscovered"]
      })
    );
    // Refined Gold may leave while Undiscovered themes keeps an option...
    expect(send).toHaveBeenCalledTimes(1);
    send.mockClear();
    act(() => result.current.change({ kind: "random-list", value: [] }));
    expect(send).not.toHaveBeenCalled();
  });

  it("changing the Fixed theme ends a shuffle and repaints", async () => {
    window.localStorage.setItem(
      "fo:shuffle",
      JSON.stringify({ identity: "user:7", day: 1, brand: "noir", rounds: {}, seq: 1 })
    );
    const user = account();
    const send = vi.fn(async (patch: AppearancePatch) => saved(user, { ...patch }));
    const { result, show } = setup(user, send);
    act(() => result.current.change({ kind: "selection", selection: "fixed" }));
    expect(show).toHaveBeenCalledWith("ballot", LIGHT_MODE);
    expect(window.localStorage.getItem("fo:shuffle")).toBeNull();
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({ brand_preference: "ballot" })
    );
    await waitFor(() => expect(result.current.view.selection.value).toBe("fixed"));
  });

  it("later changes made during a save are sent after it, in one request", async () => {
    const user = account();
    let finish!: (outcome: SaveOutcome) => void;
    const send = vi
      .fn<(patch: AppearancePatch) => Promise<SaveOutcome>>()
      .mockImplementationOnce(
        () =>
          new Promise<SaveOutcome>((resolve) => {
            finish = resolve;
          })
      )
      .mockImplementation(async (patch) => saved(user, { ...patch }));
    const { result } = setup(user, send);
    act(() => result.current.change({ kind: "mode", mode: "dark" }));
    act(() => result.current.change({ kind: "policy", policy: "exclude" }));
    act(() => result.current.change({ kind: "mode", mode: "light" }));
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => finish(saved(user, { mode_preference: "dark" })));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send).toHaveBeenLastCalledWith({
      mode_preference: "light",
      single_mode_policy: "exclude"
    });
  });
});
