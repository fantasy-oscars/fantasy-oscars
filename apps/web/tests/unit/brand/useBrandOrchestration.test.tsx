import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND_IDS } from "@fantasy-oscars/shared";
import {
  useBrandOrchestration,
  type BrandOrchestrationInput
} from "@/orchestration/brand/orchestration";
import {
  effectiveBrandPreference,
  isPinReusable,
  parseBrandPin,
  shouldAdoptLocalPreference
} from "@/decisions/brand";

type User = NonNullable<BrandOrchestrationInput["user"]>;

// 2026-05-05 12:00 local; rotate index is days-since-epoch mod 7.
const NOON = new Date(2026, 4, 5, 12, 0);
const AFTER_4AM_NEXT_DAY = new Date(2026, 4, 6, 4, 1);

function fetchOk(body: unknown = {}) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

function setup(initial: Partial<BrandOrchestrationInput> & { now?: () => Date }) {
  const refreshAuth = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(
    (props: Partial<BrandOrchestrationInput>) =>
      useBrandOrchestration({
        user: null,
        authLoading: false,
        refreshAuth,
        now: () => NOON,
        ...props
      }),
    { initialProps: initial }
  );
  return { ...hook, refreshAuth };
}

const user = (over: Partial<User> = {}): User => ({ sub: "7", ...over });

describe("useBrandOrchestration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete document.documentElement.dataset.brand;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("waits for the session check before resolving", () => {
    const { result } = setup({ authLoading: true });
    expect(result.current.brand).toBeNull();
    expect(document.documentElement.dataset.brand).toBeUndefined();
  });

  it("rotates for logged-out visitors and sets the data attribute", async () => {
    const { result } = setup({});
    await waitFor(() => expect(result.current.brand).not.toBeNull());
    expect(BRAND_IDS).toContain(result.current.brand);
    expect(document.documentElement.dataset.brand).toBe(result.current.brand);
    expect(result.current.preference).toBe("rotate");
  });

  it("pins the brand for the session: a clock past 04:00 does not restyle", async () => {
    let clock = NOON;
    const { result, rerender } = setup({ now: () => clock });
    await waitFor(() => expect(result.current.brand).not.toBeNull());
    const first = result.current.brand;
    clock = AFTER_4AM_NEXT_DAY;
    rerender({ now: () => clock });
    expect(result.current.brand).toBe(first);
  });

  it("re-resolves in a new session (no pin) on a later day", async () => {
    const first = setup({ now: () => NOON });
    await waitFor(() => expect(first.result.current.brand).not.toBeNull());
    const day1 = first.result.current.brand;
    first.unmount();
    window.sessionStorage.clear();
    const second = setup({ now: () => AFTER_4AM_NEXT_DAY });
    await waitFor(() => expect(second.result.current.brand).not.toBeNull());
    expect(second.result.current.brand).toBe(
      BRAND_IDS[(BRAND_IDS.indexOf(day1!) + 1) % BRAND_IDS.length]
    );
  });

  it("reuses the pin after a reload on the same day", async () => {
    const first = setup({});
    await waitFor(() => expect(first.result.current.brand).not.toBeNull());
    first.unmount();
    const pin = parseBrandPin(window.sessionStorage.getItem("fo:brand-session"))!;
    const other = pin.brand === "noir" ? "ballot" : "noir";
    window.sessionStorage.setItem(
      "fo:brand-session",
      JSON.stringify({ ...pin, brand: other })
    );
    const second = setup({});
    await waitFor(() => expect(second.result.current.brand).toBe(other));
  });

  it("uses a locally stored preference when logged out", async () => {
    window.localStorage.setItem("fo:brand-preference", "ballot");
    const { result } = setup({});
    await waitFor(() => expect(result.current.brand).toBe("ballot"));
    expect(result.current.preference).toBe("ballot");
  });

  it("ignores an invalid stored preference and rotates", async () => {
    window.localStorage.setItem("fo:brand-preference", "chartreuse");
    const { result } = setup({});
    await waitFor(() => expect(result.current.brand).not.toBeNull());
    expect(result.current.preference).toBe("rotate");
  });

  it("saves a logged-out choice locally and re-resolves", async () => {
    const { result } = setup({});
    await waitFor(() => expect(result.current.brand).not.toBeNull());
    await act(async () => {
      await result.current.setPreference("lightbox");
    });
    expect(result.current.brand).toBe("lightbox");
    expect(window.localStorage.getItem("fo:brand-preference")).toBe("lightbox");
    await act(async () => {
      await result.current.setPreference("rotate");
    });
    expect(window.localStorage.getItem("fo:brand-preference")).toBeNull();
  });

  it("lets the account preference win over a local one", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("fo:brand-preference", "ballot");
    const { result } = setup({ user: user({ brand_preference: "noir" }) });
    await waitFor(() => expect(result.current.brand).toBe("noir"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("fo:brand-preference")).toBe("ballot");
  });

  it("adopts a local preference when the account has none", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("fo:brand-preference", "festival");
    const { result, refreshAuth } = setup({ user: user({ brand_preference: null }) });
    await waitFor(() => expect(result.current.brand).toBe("festival"));
    await waitFor(() => expect(refreshAuth).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/me/preferences");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ brand_preference: "festival" });
    expect(window.localStorage.getItem("fo:brand-preference")).toBeNull();
  });

  it("keeps the local preference if adoption fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );
    window.localStorage.setItem("fo:brand-preference", "festival");
    const { result, refreshAuth } = setup({ user: user({ brand_preference: null }) });
    await waitFor(() => expect(result.current.brand).toBe("festival"));
    await new Promise((r) => setTimeout(r, 10));
    expect(refreshAuth).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("fo:brand-preference")).toBe("festival");
  });

  it("saves a signed-in choice to the account, not local storage", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    const { result, refreshAuth } = setup({ user: user() });
    await waitFor(() => expect(result.current.brand).not.toBeNull());
    await act(async () => {
      await result.current.setPreference("technicolor");
    });
    expect(refreshAuth).toHaveBeenCalled();
    expect(window.localStorage.getItem("fo:brand-preference")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-resolves on login and logout but not on clock changes", async () => {
    window.localStorage.setItem("fo:brand-preference", "red-carpet");
    const { result, rerender } = setup({});
    await waitFor(() => expect(result.current.brand).toBe("red-carpet"));
    rerender({ user: user({ brand_preference: "noir" }) });
    await waitFor(() => expect(result.current.brand).toBe("noir"));
    rerender({ user: null });
    await waitFor(() => expect(result.current.brand).toBe("red-carpet"));
  });

  it("gives random a stable result per person", async () => {
    window.localStorage.setItem("fo:brand-preference", "random");
    const a = setup({});
    await waitFor(() => expect(a.result.current.brand).not.toBeNull());
    const first = a.result.current.brand;
    a.unmount();
    window.sessionStorage.clear();
    const b = setup({});
    await waitFor(() => expect(b.result.current.brand).toBe(first));
  });
});

describe("brand decisions", () => {
  it("picks the effective preference", () => {
    expect(
      effectiveBrandPreference({
        signedIn: true,
        serverPreference: "noir",
        localPreference: "ballot"
      })
    ).toBe("noir");
    expect(
      effectiveBrandPreference({
        signedIn: true,
        serverPreference: null,
        localPreference: "ballot"
      })
    ).toBe("ballot");
    expect(
      effectiveBrandPreference({
        signedIn: false,
        serverPreference: "noir",
        localPreference: null
      })
    ).toBeNull();
    expect(
      effectiveBrandPreference({
        signedIn: true,
        serverPreference: "bogus",
        localPreference: null
      })
    ).toBeNull();
  });

  it("adopts only for signed-in users without a server value", () => {
    const base = { signedIn: true, serverPreference: null, localPreference: null };
    expect(shouldAdoptLocalPreference(base)).toBe(false);
    expect(shouldAdoptLocalPreference({ ...base, localPreference: "noir" })).toBe(true);
    expect(
      shouldAdoptLocalPreference({ ...base, localPreference: "noir", signedIn: false })
    ).toBe(false);
    expect(
      shouldAdoptLocalPreference({
        ...base,
        localPreference: "noir",
        serverPreference: "ballot"
      })
    ).toBe(false);
  });

  it("parses pins defensively and reuses only the same key and day", () => {
    expect(parseBrandPin(null)).toBeNull();
    expect(parseBrandPin("{")).toBeNull();
    expect(parseBrandPin(JSON.stringify({ brand: "x", day: 1, key: "k" }))).toBeNull();
    const pin = parseBrandPin(JSON.stringify({ brand: "noir", day: 5, key: "k" }));
    expect(pin).toEqual({ brand: "noir", day: 5, key: "k" });
    expect(isPinReusable(pin, "k", 5)).toBe(true);
    expect(isPinReusable(pin, "k", 6)).toBe(false);
    expect(isPinReusable(pin, "other", 5)).toBe(false);
    expect(isPinReusable(null, "k", 5)).toBe(false);
  });
});
