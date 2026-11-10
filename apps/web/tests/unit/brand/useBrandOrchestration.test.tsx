import { StrictMode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAND_CATALOG,
  BRAND_IDS,
  ENABLED_BRAND_IDS,
  STARTING_BRAND,
  brandDayNumber,
  localDateTimeFromDate,
  type BrandId
} from "@fantasy-oscars/shared/brands";
import type { DailyDraw } from "@fantasy-oscars/shared/appearance";
import {
  useBrandOrchestration,
  type BrandOrchestrationInput,
  type SavedPreferences
} from "@/orchestration/brand/orchestration";

type User = NonNullable<BrandOrchestrationInput["user"]>;

// 2026-05-05 12:00 local.
const NOON = new Date(2026, 4, 5, 12, 0);
const AFTER_4AM_NEXT_DAY = new Date(2026, 4, 6, 4, 1);
const DAY = brandDayNumber(localDateTimeFromDate(NOON));
const rounds = { ceremony: [], cinema: [] };

const draw = (day: number, brand: BrandId): DailyDraw => ({ day, brand, rounds });
const primaryBase = (brand: BrandId) =>
  BRAND_CATALOG.find((entry) => entry.id === brand)!.modes[0].base;
const user = (over: Partial<User> = {}): User => ({ sub: "7", ...over });

const root = () => document.documentElement;
const stored = (key: string): unknown =>
  JSON.parse(window.localStorage.getItem(key) ?? "null");

/** A stand-in for Mantine's setter: it writes the attribute. */
function schemeSetter() {
  return vi.fn((base: string) => root().setAttribute("data-mantine-color-scheme", base));
}

type Respond = (body: Record<string, unknown>) => SavedPreferences | null;

/** PATCH /auth/me/preferences, answered by `respond` (null = server error). */
function stubPatch(respond: Respond) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const saved = respond(
      JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    );
    if (!saved) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { code: "INTERNAL_ERROR" } })
      };
    }
    return { ok: true, status: 200, json: async () => ({ preferences: saved }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The account keeps whatever the PATCH sent. */
function accountStore(initial: User): Respond {
  let appearance: Record<string, unknown> = { ...(initial.appearance ?? {}) };
  return (body) => {
    const known = (appearance.discovered_brands as string[] | undefined) ?? [];
    appearance = {
      ...appearance,
      ...(body.mode_preference ? { mode_preference: body.mode_preference } : {}),
      discovered_brands: [
        ...new Set([...known, ...((body.add_discovered_brands as string[]) ?? [])])
      ],
      ...(body.daily_draw ? { daily_draw: body.daily_draw } : {})
    };
    return { brand_preference: initial.brand_preference ?? null, appearance };
  };
}

function setup(initial: Partial<BrandOrchestrationInput>, strict = false) {
  const setColorScheme = schemeSetter();
  const hook = renderHook(
    (props: Partial<BrandOrchestrationInput>) =>
      useBrandOrchestration({
        user: null,
        authLoading: false,
        sessionError: null,
        setColorScheme,
        now: () => NOON,
        enabled: BRAND_IDS,
        testOverride: false,
        ...props
      }),
    { initialProps: initial, ...(strict ? { wrapper: StrictMode } : {}) }
  );
  return { ...hook, setColorScheme };
}

const writes = () => {
  const set = vi.spyOn(Storage.prototype, "setItem");
  const remove = vi.spyOn(Storage.prototype, "removeItem");
  return {
    set,
    remove,
    none: () => set.mock.calls.length + remove.mock.calls.length === 0
  };
};

describe("useBrandOrchestration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    root().removeAttribute("data-brand");
    root().removeAttribute("data-mantine-color-scheme");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("waits for the session check before resolving", () => {
    const spy = writes();
    const { result, setColorScheme } = setup({ authLoading: true });
    expect(result.current.brand).toBeNull();
    expect(root().dataset.brand).toBeUndefined();
    expect(setColorScheme).not.toHaveBeenCalled();
    expect(spy.none()).toBe(true);
  });

  describe("session check failed (step 1)", () => {
    it("changes nothing and writes nothing, locally or remotely", async () => {
      window.localStorage.setItem("fo:anon-id", "anon-1");
      window.localStorage.setItem(
        "fo:account-appearance",
        JSON.stringify({ identity: "user:7", brandPreference: null, appearance: {} })
      );
      window.localStorage.setItem("fo:discovered", JSON.stringify(["ballot"]));
      window.localStorage.setItem("fo:brand-preference", "noir");
      window.sessionStorage.setItem("fo:brand-session", "x");
      root().dataset.brand = "noir";
      root().setAttribute("data-mantine-color-scheme", "dark");
      const fetchMock = stubPatch(() => null);
      const spy = writes();

      const { result, setColorScheme } = setup({
        sessionError: "Unable to verify session"
      });
      // Give any stray effect a chance to run.
      await act(async () => undefined);

      expect(result.current.brand).toBeNull();
      expect(root().dataset.brand).toBe("noir");
      expect(setColorScheme).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(spy.none()).toBe(true);
      expect(window.localStorage.getItem("fo:account-appearance")).not.toBeNull();
      expect(window.localStorage.getItem("fo:brand-preference")).toBe("noir");
      expect(window.sessionStorage.getItem("fo:brand-session")).toBe("x");
    });

    it("retries when a later answer arrives", async () => {
      const { result, rerender } = setup({ sessionError: "down" });
      expect(result.current.brand).toBeNull();
      rerender({ sessionError: null });
      await waitFor(() => expect(result.current.brand).not.toBeNull());
    });

    it("is not triggered by a failed background refetch while a user is known", async () => {
      const record = draw(DAY, "noir");
      const account = user({ appearance: { daily_draw: record } });
      stubPatch(accountStore(account));
      const { result, rerender } = setup({ user: account });
      await waitFor(() => expect(result.current.brand).toBe("noir"));
      rerender({ user: account, sessionError: "refetch failed" });
      await act(async () => undefined);
      expect(result.current.brand).toBe("noir");
    });
  });

  describe("logged out", () => {
    it("draws, applies the theme and its primary mode, and saves the draw", async () => {
      const fetchMock = stubPatch(() => null);
      const { result, setColorScheme } = setup({});
      await waitFor(() => expect(result.current.brand).not.toBeNull());
      const brand = result.current.brand!;
      expect(root().dataset.brand).toBe(brand);
      expect(setColorScheme).toHaveBeenCalledWith(primaryBase(brand));
      expect(result.current.mode?.base).toBe(primaryBase(brand));
      expect(stored("fo:anon-draw")).toMatchObject({ day: DAY, brand });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("records a discovery for a new theme but never for the starting theme", async () => {
      const { result } = setup({});
      await waitFor(() => expect(result.current.brand).not.toBeNull());
      const brand = result.current.brand!;
      expect(stored("fo:discovered")).toEqual(brand === STARTING_BRAND ? null : [brand]);

      window.localStorage.clear();
      const only = setup({ enabled: ENABLED_BRAND_IDS });
      await waitFor(() => expect(only.result.current.brand).toBe(STARTING_BRAND));
      expect(window.localStorage.getItem("fo:discovered")).toBeNull();
    });

    it("keeps today's saved draw and writes nothing new", async () => {
      window.localStorage.setItem("fo:anon-id", "a");
      window.localStorage.setItem("fo:anon-draw", JSON.stringify(draw(DAY, "ballot")));
      const spy = writes();
      const { result } = setup({});
      await waitFor(() => expect(result.current.brand).toBe("ballot"));
      expect(spy.set.mock.calls.filter(([key]) => key === "fo:anon-draw")).toEqual([]);
      expect(window.localStorage.getItem("fo:discovered")).toBeNull();
    });

    it("draws a new theme on a later brand day, continuing the rounds", async () => {
      window.localStorage.setItem("fo:anon-id", "a");
      window.localStorage.setItem(
        "fo:anon-draw",
        JSON.stringify({
          day: DAY - 1,
          brand: "ballot",
          rounds: { ceremony: ["ballot"], cinema: [] }
        })
      );
      const { result } = setup({});
      await waitFor(() => expect(result.current.brand).not.toBeNull());
      expect(result.current.brand).not.toBe("ballot");
      expect(stored("fo:anon-draw")).toMatchObject({ day: DAY });
    });

    it("does not restyle a running page past 04:00", async () => {
      let clock = NOON;
      const { result, rerender } = setup({ now: () => clock });
      await waitFor(() => expect(result.current.brand).not.toBeNull());
      const first = result.current.brand;
      clock = AFTER_4AM_NEXT_DAY;
      rerender({ now: () => clock });
      await act(async () => undefined);
      expect(result.current.brand).toBe(first);
      expect(stored("fo:anon-draw")).toMatchObject({ day: DAY });
    });

    it("retires the old keys at boot", async () => {
      window.localStorage.setItem("fo:brand-last", "{}");
      window.localStorage.setItem("fo:brand-preference", "noir");
      window.sessionStorage.setItem("fo:brand-session", "{}");
      const { result } = setup({});
      await waitFor(() => expect(result.current.brand).not.toBeNull());
      expect(window.localStorage.getItem("fo:brand-last")).toBeNull();
      expect(window.localStorage.getItem("fo:brand-preference")).toBeNull();
      expect(window.sessionStorage.getItem("fo:brand-session")).toBeNull();
    });

    it("ignores the legacy colour toggle", async () => {
      window.localStorage.setItem("mantine-color-scheme-value", "dark");
      window.localStorage.setItem("fo:anon-draw", JSON.stringify(draw(DAY, "ballot")));
      const { result } = setup({});
      await waitFor(() => expect(result.current.brand).toBe("ballot"));
      expect(result.current.mode?.base).toBe("light");
      expect(window.localStorage.getItem("mantine-color-scheme-value")).toBe("dark");
    });
  });

  describe("signed in", () => {
    it("draws on a new day and saves the draw with its discovery in one PATCH", async () => {
      const account = user({ appearance: { daily_draw: draw(DAY - 1, STARTING_BRAND) } });
      const fetchMock = stubPatch(accountStore(account));
      const onAccountSaved = vi.fn();
      const { result } = setup({ user: account, onAccountSaved });
      await waitFor(() => expect(onAccountSaved).toHaveBeenCalled());

      const brand = result.current.brand!;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toContain("/auth/me/preferences");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.daily_draw).toMatchObject({ day: DAY, brand });
      expect(body.add_discovered_brands).toEqual(
        brand === STARTING_BRAND ? undefined : [brand]
      );
      expect(body.mode_preference).toBeUndefined();
      expect(stored("fo:account-appearance")).toMatchObject({
        identity: "user:7",
        appearance: { daily_draw: { day: DAY, brand } }
      });
      // The save succeeded, so nothing stays queued.
      expect(window.localStorage.getItem("fo:discovered")).toBeNull();
    });

    it("uses today's record without drawing or saving", async () => {
      const account = user({
        appearance: { daily_draw: draw(DAY, "noir"), discovered_brands: ["noir"] }
      });
      const fetchMock = stubPatch(accountStore(account));
      const { result, setColorScheme } = setup({ user: account });
      await waitFor(() => expect(result.current.brand).toBe("noir"));
      expect(setColorScheme).toHaveBeenCalledWith("dark");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(stored("fo:account-appearance")).toMatchObject({
        appearance: { daily_draw: { brand: "noir" } }
      });
    });

    it("follows a record whose day is ahead of this device", async () => {
      const account = user({
        appearance: {
          daily_draw: draw(DAY + 1, "lightbox"),
          discovered_brands: ["lightbox"]
        }
      });
      const fetchMock = stubPatch(accountStore(account));
      const { result } = setup({ user: account });
      await waitFor(() => expect(result.current.brand).toBe("lightbox"));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("applies the saved mode to the theme", async () => {
      const account = user({
        appearance: { mode_preference: "dark", daily_draw: draw(DAY, "ballot") }
      });
      stubPatch(accountStore(account));
      const { result, setColorScheme } = setup({ user: account });
      await waitFor(() => expect(result.current.brand).toBe("ballot"));
      expect(setColorScheme).toHaveBeenCalledWith("dark");
      expect(result.current.mode).toEqual({ id: "dark", base: "dark" });
    });

    it("shows a fixed theme without drawing, saving or discovering", async () => {
      const account = user({ brand_preference: "festival" });
      const fetchMock = stubPatch(accountStore(account));
      const { result } = setup({ user: account });
      await waitFor(() => expect(result.current.brand).toBe("festival"));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem("fo:discovered")).toBeNull();
    });

    it("treats rotate, random and NULL as Random", async () => {
      for (const brand_preference of [null, "rotate", "random"]) {
        window.localStorage.clear();
        const account = user({
          brand_preference,
          appearance: { daily_draw: draw(DAY, "ballot") }
        });
        stubPatch(accountStore(account));
        const view = setup({ user: account });
        await waitFor(() => expect(view.result.current.brand).toBe("ballot"));
        cleanup();
      }
    });

    it("falls back to Random when the fixed theme is not released", async () => {
      const account = user({ brand_preference: "noir" });
      stubPatch(accountStore(account));
      const { result } = setup({ user: account, enabled: ENABLED_BRAND_IDS });
      await waitFor(() => expect(result.current.brand).toBe(STARTING_BRAND));
    });

    it("never saves twice for one boot, even when effects run twice", async () => {
      const account = user({ appearance: { daily_draw: draw(DAY - 1, STARTING_BRAND) } });
      const fetchMock = stubPatch(accountStore(account));
      const onAccountSaved = vi.fn();
      const { result } = setup({ user: account, onAccountSaved }, true);
      await waitFor(() => expect(onAccountSaved).toHaveBeenCalled());
      expect(result.current.brand).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    describe("merge at login (steps 3 and 8)", () => {
      it("sends browser discoveries and the legacy mode, then clears them", async () => {
        window.localStorage.setItem("fo:discovered", JSON.stringify(["ballot", "noir"]));
        window.localStorage.setItem("mantine-color-scheme-value", "dark");
        const account = user({
          appearance: {
            mode_preference: null,
            discovered_brands: ["noir", "festival"],
            daily_draw: draw(DAY, "festival")
          }
        });
        const fetchMock = stubPatch(accountStore(account));
        const onAccountSaved = vi.fn();
        const { setColorScheme } = setup({ user: account, onAccountSaved });
        await waitFor(() => expect(onAccountSaved).toHaveBeenCalled());

        const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<
          string,
          unknown
        >;
        expect(body).toEqual({
          add_discovered_brands: ["ballot"],
          mode_preference: "dark"
        });
        expect(setColorScheme).toHaveBeenCalledWith("dark");
        expect(window.localStorage.getItem("fo:discovered")).toBeNull();
        expect(window.localStorage.getItem("mantine-color-scheme-value")).toBeNull();
      });

      it("drops the legacy mode at once when the account already has one", async () => {
        window.localStorage.setItem("mantine-color-scheme-value", "dark");
        const account = user({
          appearance: {
            mode_preference: "light",
            discovered_brands: ["festival"],
            daily_draw: draw(DAY, "festival")
          }
        });
        const fetchMock = stubPatch(accountStore(account));
        const { setColorScheme, result } = setup({ user: account });
        await waitFor(() => expect(result.current.brand).toBe("festival"));
        expect(window.localStorage.getItem("mantine-color-scheme-value")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(setColorScheme).toHaveBeenCalledWith("light");
      });

      it("keeps the legacy mode when the account has none and nothing valid is stored", async () => {
        const account = user({ appearance: { daily_draw: draw(DAY, "festival") } });
        stubPatch(accountStore(account));
        window.localStorage.setItem("mantine-color-scheme-value", "auto");
        const { result } = setup({ user: account });
        await waitFor(() => expect(result.current.brand).toBe("festival"));
        expect(window.localStorage.getItem("mantine-color-scheme-value")).toBe("auto");
      });

      it("logging in from a logged-out page runs the merge for the new identity", async () => {
        const { result, rerender } = setup({});
        await waitFor(() => expect(result.current.brand).not.toBeNull());
        const queued = stored("fo:discovered") as string[] | null;
        const account = user({ appearance: { daily_draw: draw(DAY, "festival") } });
        const fetchMock = stubPatch(accountStore(account));
        rerender({ user: account });
        // The account's own record decides the theme.
        await waitFor(() => expect(result.current.brand).toBe("festival"));
        if (queued) {
          await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
          const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<
            string,
            unknown
          >;
          expect(body.add_discovered_brands).toEqual(expect.arrayContaining(queued));
        }
      });
    });

    describe("a save that failed earlier (step 4)", () => {
      it("keeps the snapshot's newer draw and sends it again instead of redrawing", async () => {
        const kept = draw(DAY, "technicolor");
        window.localStorage.setItem(
          "fo:account-appearance",
          JSON.stringify({
            identity: "user:7",
            brandPreference: null,
            appearance: { daily_draw: kept, discovered_brands: ["technicolor"] }
          })
        );
        const account = user({ appearance: { daily_draw: draw(DAY - 3, "ballot") } });
        const fetchMock = stubPatch(accountStore(account));
        const onAccountSaved = vi.fn();
        const { result } = setup({ user: account, onAccountSaved });
        await waitFor(() => expect(result.current.brand).toBe("technicolor"));
        await waitFor(() => expect(onAccountSaved).toHaveBeenCalled());
        const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<
          string,
          unknown
        >;
        expect(body.daily_draw).toEqual(kept);
      });

      it("ignores a snapshot of another identity", async () => {
        window.localStorage.setItem(
          "fo:account-appearance",
          JSON.stringify({
            identity: "user:99",
            brandPreference: null,
            appearance: { daily_draw: draw(DAY, "technicolor") }
          })
        );
        const account = user({ appearance: { daily_draw: draw(DAY, "ballot") } });
        stubPatch(accountStore(account));
        const { result } = setup({ user: account });
        await waitFor(() => expect(result.current.brand).toBe("ballot"));
      });
    });

    describe("save failure (step 8)", () => {
      it("keeps the local state and retries on the next load", async () => {
        window.localStorage.setItem("fo:discovered", JSON.stringify(["ballot"]));
        window.localStorage.setItem("mantine-color-scheme-value", "dark");
        const account = user({
          appearance: { daily_draw: draw(DAY - 1, STARTING_BRAND) }
        });
        const failing = stubPatch(() => null);
        const onAccountSaved = vi.fn();
        const first = setup({ user: account, onAccountSaved });
        await waitFor(() => expect(failing).toHaveBeenCalled());
        await act(async () => undefined);
        const brand = first.result.current.brand!;

        expect(onAccountSaved).not.toHaveBeenCalled();
        expect(root().dataset.brand).toBe(brand);
        expect(stored("fo:account-appearance")).toMatchObject({
          appearance: { daily_draw: { day: DAY, brand } }
        });
        expect(stored("fo:discovered")).toEqual(expect.arrayContaining(["ballot"]));
        expect(window.localStorage.getItem("mantine-color-scheme-value")).toBe("dark");
        cleanup();

        // Next load: the same draw is sent again, not a new one.
        const ok = stubPatch(accountStore(account));
        const second = setup({ user: account, onAccountSaved });
        await waitFor(() => expect(onAccountSaved).toHaveBeenCalled());
        expect(second.result.current.brand).toBe(brand);
        const body = JSON.parse(String(ok.mock.calls[0]![1]?.body)) as Record<
          string,
          unknown
        >;
        expect(body.daily_draw).toMatchObject({ day: DAY, brand });
        expect(body.add_discovered_brands).toEqual(expect.arrayContaining(["ballot"]));
        expect(window.localStorage.getItem("fo:discovered")).toBeNull();
      });
    });

    describe("losing the compare-and-set (step 8)", () => {
      it("adopts the account's record once and saves it as the snapshot", async () => {
        const account = user({
          appearance: { daily_draw: draw(DAY - 1, STARTING_BRAND) }
        });
        const winner = draw(DAY, "lightbox");
        stubPatch((body) => {
          const sent = body.daily_draw as DailyDraw;
          expect(sent.brand).not.toBe("lightbox");
          return {
            brand_preference: null,
            appearance: { daily_draw: winner, discovered_brands: ["lightbox"] }
          };
        });
        const onAccountSaved = vi.fn();
        const { result } = setup({ user: account, onAccountSaved });
        await waitFor(() => expect(result.current.brand).toBe("lightbox"));
        expect(root().dataset.brand).toBe("lightbox");
        expect(stored("fo:account-appearance")).toMatchObject({
          appearance: { daily_draw: { brand: "lightbox" } }
        });
        expect(onAccountSaved).toHaveBeenCalledTimes(1);
      });
    });

    it("a signed-in boot on a fresh device replaces the guess and writes the snapshot", async () => {
      // Empty storage: the script painted an anonymous draw; the account's record wins.
      root().dataset.brand = "ballot";
      root().setAttribute("data-mantine-color-scheme", "light");
      const account = user({
        appearance: { daily_draw: draw(DAY, "noir"), discovered_brands: ["noir"] }
      });
      stubPatch(accountStore(account));
      const { result, setColorScheme } = setup({ user: account });
      await waitFor(() => expect(result.current.brand).toBe("noir"));
      expect(root().dataset.brand).toBe("noir");
      expect(setColorScheme).toHaveBeenCalledWith("dark");
      expect(stored("fo:account-appearance")).toMatchObject({ identity: "user:7" });
      // The guess was never recorded as a discovery or a draw.
      expect(window.localStorage.getItem("fo:anon-draw")).toBeNull();
      expect(window.localStorage.getItem("fo:discovered")).toBeNull();
    });
  });

  describe("session expired", () => {
    const snapshot = JSON.stringify({
      identity: "user:7",
      brandPreference: null,
      appearance: { daily_draw: { day: DAY, brand: "noir", rounds } }
    });

    it("swaps once to the logged-out theme and removes the snapshot, writing nothing to the account", async () => {
      window.localStorage.setItem("fo:account-appearance", snapshot);
      window.localStorage.setItem("fo:discovered", JSON.stringify(["ballot"]));
      window.localStorage.setItem("fo:anon-draw", JSON.stringify(draw(DAY, "festival")));
      root().dataset.brand = "noir";
      root().setAttribute("data-mantine-color-scheme", "dark");
      const fetchMock = stubPatch(() => null);

      const { result, setColorScheme } = setup({ user: null, sessionError: null });
      await waitFor(() => expect(result.current.brand).toBe("festival"));

      expect(root().dataset.brand).toBe("festival");
      expect(setColorScheme).toHaveBeenCalledTimes(1);
      expect(setColorScheme).toHaveBeenCalledWith("light");
      expect(window.localStorage.getItem("fo:account-appearance")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      // The browser queue stays for the merge at the next login.
      expect(stored("fo:discovered")).toEqual(["ballot"]);
    });

    it("draws for the anonymous identity when it has no record, saving only locally", async () => {
      window.localStorage.setItem("fo:account-appearance", snapshot);
      const fetchMock = stubPatch(() => null);
      const { result } = setup({ user: null });
      await waitFor(() => expect(result.current.brand).not.toBeNull());
      expect(stored("fo:anon-draw")).toMatchObject({ day: DAY });
      expect(window.localStorage.getItem("fo:account-appearance")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not swap when the logged-out theme is already painted", async () => {
      window.localStorage.setItem("fo:account-appearance", snapshot);
      window.localStorage.setItem("fo:anon-draw", JSON.stringify(draw(DAY, "festival")));
      root().dataset.brand = "festival";
      root().setAttribute("data-mantine-color-scheme", "light");
      const { result, setColorScheme } = setup({ user: null });
      await waitFor(() => expect(result.current.brand).toBe("festival"));
      expect(setColorScheme).not.toHaveBeenCalled();
    });

    it("a logout while the page is open takes the same path", async () => {
      const account = user({
        appearance: { daily_draw: draw(DAY, "noir"), discovered_brands: ["noir"] }
      });
      const fetchMock = stubPatch(accountStore(account));
      window.localStorage.setItem("fo:anon-draw", JSON.stringify(draw(DAY, "festival")));
      const { result, rerender } = setup({ user: account });
      await waitFor(() => expect(result.current.brand).toBe("noir"));
      expect(window.localStorage.getItem("fo:account-appearance")).not.toBeNull();

      rerender({ user: null });
      await waitFor(() => expect(result.current.brand).toBe("festival"));
      expect(window.localStorage.getItem("fo:account-appearance")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("wordmark shuffle record", () => {
    const shuffle = (over: Record<string, unknown>) =>
      JSON.stringify({
        identity: "user:7",
        day: DAY,
        brand: "lightbox",
        rounds,
        seq: 1,
        ...over
      });

    it("shows today's shuffle for the same identity, over the day's theme", async () => {
      const account = user({
        appearance: { daily_draw: draw(DAY, "noir"), discovered_brands: ["noir"] }
      });
      stubPatch(accountStore(account));
      window.localStorage.setItem("fo:shuffle", shuffle({}));
      const { result } = setup({ user: account });
      await waitFor(() => expect(result.current.brand).toBe("lightbox"));
      // The shuffled theme is never saved as the day's theme.
      expect(stored("fo:account-appearance")).toMatchObject({
        appearance: { daily_draw: { brand: "noir" } }
      });
    });

    it("removes and ignores a shuffle from another day or identity", async () => {
      const account = user({
        appearance: { daily_draw: draw(DAY, "noir"), discovered_brands: ["noir"] }
      });
      stubPatch(accountStore(account));
      for (const over of [{ day: DAY - 1 }, { identity: "user:8" }]) {
        window.localStorage.setItem("fo:shuffle", shuffle(over));
        const view = setup({ user: account });
        await waitFor(() => expect(view.result.current.brand).toBe("noir"));
        expect(window.localStorage.getItem("fo:shuffle")).toBeNull();
        cleanup();
      }
    });
  });

  describe("test override", () => {
    const override = JSON.stringify({ brand: "noir", mode: "light" });

    it("is honoured in a test build: nothing is drawn, saved or discovered", async () => {
      window.localStorage.setItem("fo:test-appearance", override);
      const fetchMock = stubPatch(() => null);
      const { result, setColorScheme } = setup({ testOverride: true });
      await waitFor(() => expect(result.current.brand).toBe("noir"));
      expect(setColorScheme).toHaveBeenCalledWith("light");
      expect(window.localStorage.getItem("fo:anon-draw")).toBeNull();
      expect(window.localStorage.getItem("fo:discovered")).toBeNull();
      expect(window.localStorage.getItem("fo:account-appearance")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps a signed-in session from saving anything", async () => {
      window.localStorage.setItem("fo:test-appearance", override);
      const account = user({ appearance: { daily_draw: draw(DAY - 1, STARTING_BRAND) } });
      const fetchMock = stubPatch(accountStore(account));
      const { result } = setup({ user: account, testOverride: true });
      await waitFor(() => expect(result.current.brand).toBe("noir"));
      await act(async () => undefined);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is ignored when the build is not a test build", async () => {
      window.localStorage.setItem("fo:test-appearance", override);
      window.localStorage.setItem("fo:anon-draw", JSON.stringify(draw(DAY, "ballot")));
      const { result } = setup({ testOverride: false });
      await waitFor(() => expect(result.current.brand).toBe("ballot"));
    });
  });
});
