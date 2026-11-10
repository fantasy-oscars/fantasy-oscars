import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  act,
  waitFor
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { MantineProvider } from "@ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRAND_CATALOG,
  BRAND_IDS,
  STARTING_BRAND,
  brandDayNumber,
  localDateTimeFromDate,
  type BrandId
} from "@fantasy-oscars/shared/brands";
import { Wordmark } from "@/app/chrome/ui/Wordmark";
import { handleWordmarkClick } from "@/app/chrome/wordmarkClick";
import { decideWordmarkShuffle } from "@/decisions/appearance";
import {
  useBrandOrchestration,
  type BrandOrchestrationInput,
  type SavedPreferences
} from "@/orchestration/brand/orchestration";

type User = NonNullable<BrandOrchestrationInput["user"]>;

// 2026-05-05 12:00 local.
const NOON = new Date(2026, 4, 5, 12, 0);
const NEXT_DAY = new Date(2026, 4, 6, 4, 1);
const DAY = brandDayNumber(localDateTimeFromDate(NOON));
const rounds = { ceremony: [], cinema: [] };

const root = () => document.documentElement;
const stored = (key: string): unknown =>
  JSON.parse(window.localStorage.getItem(key) ?? "null");
const primaryBase = (brand: BrandId) =>
  BRAND_CATALOG.find((entry) => entry.id === brand)!.modes[0].base;

function schemeSetter() {
  return vi.fn((base: string) => root().setAttribute("data-mantine-color-scheme", base));
}

/** Answers every PATCH with the account keeping what was sent. */
function stubPatch(initial: User) {
  let discovered = [...((initial.appearance?.discovered_brands as string[]) ?? [])];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    discovered = [
      ...new Set([...discovered, ...((body.add_discovered_brands as string[]) ?? [])])
    ];
    const saved: SavedPreferences = {
      brand_preference: initial.brand_preference ?? null,
      appearance: { ...(initial.appearance ?? {}), discovered_brands: discovered }
    };
    return { ok: true, status: 200, json: async () => ({ preferences: saved }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const patchBodies = (fetchMock: ReturnType<typeof stubPatch>) =>
  fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>
  );

function setup(props: Partial<BrandOrchestrationInput> = {}) {
  const setColorScheme = schemeSetter();
  const hook = renderHook(
    (current: Partial<BrandOrchestrationInput>) =>
      useBrandOrchestration({
        user: null,
        authLoading: false,
        sessionError: null,
        setColorScheme,
        now: () => NOON,
        enabled: BRAND_IDS,
        testOverride: false,
        ...current
      }),
    { initialProps: props }
  );
  return { ...hook, setColorScheme };
}

/** A signed-in user whose day is already drawn and discovered, so boot sends nothing. */
function account(over: Partial<User> = {}, discovered: BrandId[] = ["noir"]): User {
  return {
    sub: "7",
    appearance: {
      daily_draw: { day: DAY, brand: "noir", rounds },
      discovered_brands: discovered
    },
    ...over
  };
}

async function booted(result: { current: { brand: BrandId | null } }) {
  await waitFor(() => expect(result.current.brand).not.toBeNull());
}

function shuffleOnce(result: { current: { shuffle: () => string } }) {
  let outcome = "";
  act(() => {
    outcome = result.current.shuffle();
  });
  return outcome;
}

describe("decideWordmarkShuffle", () => {
  const plain = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    pathname: "/"
  };

  it("shuffles for a plain primary click on Home", () => {
    expect(decideWordmarkShuffle(plain)).toBe(true);
  });

  it("does not shuffle for modifier clicks, other buttons, or other pages", () => {
    expect(decideWordmarkShuffle({ ...plain, metaKey: true })).toBe(false);
    expect(decideWordmarkShuffle({ ...plain, ctrlKey: true })).toBe(false);
    expect(decideWordmarkShuffle({ ...plain, shiftKey: true })).toBe(false);
    expect(decideWordmarkShuffle({ ...plain, altKey: true })).toBe(false);
    expect(decideWordmarkShuffle({ ...plain, button: 1 })).toBe(false);
    expect(decideWordmarkShuffle({ ...plain, button: 2 })).toBe(false);
    expect(decideWordmarkShuffle({ ...plain, pathname: "/about" })).toBe(false);
    expect(decideWordmarkShuffle({ ...plain, pathname: "/leagues/" })).toBe(false);
  });
});

describe("wordmark click glue", () => {
  afterEach(cleanup);

  /** Whether the glue itself prevented the click (the router prevents it when it navigates). */
  let prevented: boolean[] = [];
  beforeEach(() => {
    prevented = [];
  });

  function Harness(props: { shuffle: () => "shuffled" | "busy" | "none" }) {
    const { pathname } = useLocation();
    return (
      <>
        <Wordmark
          onClick={(event) => {
            handleWordmarkClick(event, pathname, props.shuffle);
            prevented.push(event.defaultPrevented);
          }}
        />
        <p data-testid="where">{pathname}</p>
      </>
    );
  }

  function renderAt(path: string, shuffle: () => "shuffled" | "busy" | "none") {
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={[path]}>
          <Harness shuffle={shuffle} />
        </MemoryRouter>
      </MantineProvider>
    );
    return screen.getByRole("link", { name: /fantasy oscars/i });
  }

  it("shuffles on a plain click on Home and does not navigate", () => {
    const shuffle = vi.fn(() => "shuffled" as const);
    const link = renderAt("/", shuffle);
    expect(fireEvent.click(link)).toBe(false);
    expect(shuffle).toHaveBeenCalledTimes(1);
    expect(prevented).toEqual([true]);
    expect(screen.getByTestId("where").textContent).toBe("/");
  });

  it("treats a click during a running transition as handled", () => {
    const link = renderAt("/", () => "busy");
    fireEvent.click(link);
    expect(prevented).toEqual([true]);
  });

  it("leaves modifier and non-primary clicks alone", () => {
    const shuffle = vi.fn(() => "shuffled" as const);
    const link = renderAt("/", shuffle);
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { shiftKey: true });
    fireEvent.click(link, { altKey: true });
    fireEvent.click(link, { button: 1 });
    expect(shuffle).not.toHaveBeenCalled();
    expect(prevented).toEqual([false, false, false, false, false]);
  });

  it("is an ordinary link when there is nothing to shuffle", () => {
    const shuffle = vi.fn(() => "none" as const);
    const link = renderAt("/", shuffle);
    fireEvent.click(link);
    expect(shuffle).toHaveBeenCalledTimes(1);
    expect(prevented).toEqual([false]);
  });

  it("does not shuffle off Home, and the click that arrives at Home does not either", () => {
    const shuffle = vi.fn(() => "shuffled" as const);
    const link = renderAt("/about", shuffle);
    fireEvent.click(link);
    expect(shuffle).not.toHaveBeenCalled();
    expect(prevented).toEqual([false]);
    expect(screen.getByTestId("where").textContent).toBe("/");

    // Now on Home, the next plain click shuffles.
    fireEvent.click(link);
    expect(shuffle).toHaveBeenCalledTimes(1);
  });

  it("treats a query string or hash on Home as Home", () => {
    const shuffle = vi.fn(() => "shuffled" as const);
    const link = renderAt("/?a=1#b", shuffle);
    fireEvent.click(link);
    expect(shuffle).toHaveBeenCalledTimes(1);
  });
});

describe("wordmark shuffle (useBrandOrchestration.shuffle)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    root().removeAttribute("data-brand");
    root().removeAttribute("data-mantine-color-scheme");
    window.localStorage.setItem("fo:anon-id", "anon-1");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "startViewTransition");
  });

  it("swaps to another theme in its primary mode and records the shuffle", async () => {
    const { result, setColorScheme } = setup();
    await booted(result);
    const before = result.current.brand!;

    expect(shuffleOnce(result)).toBe("shuffled");

    const after = result.current.brand!;
    expect(after).not.toBe(before);
    expect(root().dataset.brand).toBe(after);
    expect(setColorScheme).toHaveBeenLastCalledWith(primaryBase(after));
    expect(result.current.mode?.base).toBe(primaryBase(after));
    const record = stored("fo:shuffle") as Record<string, unknown>;
    expect(record).toMatchObject({
      identity: "anon:anon-1",
      day: DAY,
      brand: after,
      seq: 1
    });
    expect((record.rounds as { ceremony: string[] }).ceremony).toContain(before);
  });

  it("keeps the shuffle on reload until the next brand day", async () => {
    const first = setup();
    await booted(first.result);
    shuffleOnce(first.result);
    const shuffled = first.result.current.brand!;
    first.unmount();
    root().removeAttribute("data-brand");

    const sameDay = setup();
    await booted(sameDay.result);
    expect(sameDay.result.current.brand).toBe(shuffled);
    expect(root().dataset.brand).toBe(shuffled);
    sameDay.unmount();

    const nextDay = setup({ now: () => NEXT_DAY });
    await booted(nextDay.result);
    expect(window.localStorage.getItem("fo:shuffle")).toBeNull();
  });

  it("ignores and removes a shuffle made by another identity", async () => {
    const signedIn = account();
    stubPatch(signedIn);
    const first = setup({ user: signedIn });
    await booted(first.result);
    shuffleOnce(first.result);
    expect(stored("fo:shuffle")).toMatchObject({ identity: "user:7" });
    first.unmount();

    const other = account({ sub: "8" });
    const second = setup({ user: other });
    await booted(second.result);
    expect(window.localStorage.getItem("fo:shuffle")).toBeNull();
    expect(second.result.current.brand).toBe("noir");
  });

  it("clears the shuffle when the identity changes in a running tab", async () => {
    const signedIn = account();
    stubPatch(signedIn);
    const { result, rerender } = setup({ user: signedIn });
    await booted(result);
    shuffleOnce(result);
    expect(stored("fo:shuffle")).not.toBeNull();

    rerender({ user: account({ sub: "8" }) });
    await waitFor(() => expect(result.current.brand).toBe("noir"));
    expect(window.localStorage.getItem("fo:shuffle")).toBeNull();
  });

  it("shares rounds and seq between tabs at click time", async () => {
    const tabA = setup();
    const tabB = setup();
    await booted(tabA.result);
    await booted(tabB.result);
    const start = tabA.result.current.brand!;
    expect(tabB.result.current.brand).toBe(start);

    shuffleOnce(tabA.result);
    const fromA = tabA.result.current.brand!;
    // The other tab keeps what it painted, but its click reads the stored record.
    expect(tabB.result.current.brand).toBe(start);
    shuffleOnce(tabB.result);
    const fromB = tabB.result.current.brand!;

    const record = stored("fo:shuffle") as {
      seq: number;
      brand: string;
      rounds: { ceremony: string[] };
    };
    expect(record.seq).toBe(2);
    expect(record.brand).toBe(fromB);
    expect(record.rounds.ceremony).toEqual(expect.arrayContaining([start, fromA, fromB]));
    expect(fromB).not.toBe(start);
    expect(fromB).not.toBe(fromA);
  });

  it("never writes the saved preference or Mode, and sends nothing for a known theme", async () => {
    const signedIn = account({}, [...BRAND_IDS]);
    const fetchMock = stubPatch(signedIn);
    const { result } = setup({ user: signedIn });
    await booted(result);
    for (let i = 0; i < 6; i += 1) shuffleOnce(result);
    expect(fetchMock).not.toHaveBeenCalled();
    // Theme-default mode: the shuffled theme's primary mode.
    expect(result.current.mode?.base).toBe(primaryBase(result.current.brand!));
  });

  it("records a discovery only for a new theme, as one small PATCH", async () => {
    const signedIn = account();
    const fetchMock = stubPatch(signedIn);
    const onAccountSaved = vi.fn();
    const { result } = setup({ user: signedIn, onAccountSaved });
    await booted(result);

    const known = new Set<string>([STARTING_BRAND, "noir"]);
    let sawNew = false;
    for (let i = 0; i < 6; i += 1) {
      const callsBefore = fetchMock.mock.calls.length;
      shuffleOnce(result);
      const brand = result.current.brand!;
      await act(async () => undefined);
      if (known.has(brand)) {
        expect(fetchMock.mock.calls.length).toBe(callsBefore);
      } else {
        sawNew = true;
        expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
        expect(patchBodies(fetchMock).at(-1)).toEqual({ add_discovered_brands: [brand] });
        known.add(brand);
      }
    }
    expect(sawNew).toBe(true);
    await waitFor(() => expect(onAccountSaved).toHaveBeenCalled());
    // Confirmed discoveries leave the browser queue.
    expect(window.localStorage.getItem("fo:discovered")).toBeNull();
    for (const body of patchBodies(fetchMock)) {
      expect(Object.keys(body)).toEqual(["add_discovered_brands"]);
    }
  });

  it("keeps a failed discovery queued for the next boot", async () => {
    const signedIn = account();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: "INTERNAL_ERROR" } })
      }))
    );
    const { result } = setup({ user: signedIn });
    await booted(result);
    let queued: string[] = [];
    for (let i = 0; i < 6 && queued.length === 0; i += 1) {
      shuffleOnce(result);
      await act(async () => undefined);
      queued = (stored("fo:discovered") as string[] | null) ?? [];
    }
    expect(queued).toEqual([result.current.brand]);
  });

  it("queues a logged-out discovery locally and sends nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = setup();
    await booted(result);
    const seen = new Set<string>((stored("fo:discovered") as string[] | null) ?? []);
    for (let i = 0; i < 4; i += 1) {
      shuffleOnce(result);
      const brand = result.current.brand!;
      if (brand !== STARTING_BRAND) seen.add(brand);
    }
    expect(new Set(stored("fo:discovered") as string[])).toEqual(seen);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays among the discovered themes under Fixed and discovers nothing", async () => {
    const signedIn = account({ brand_preference: "ballot" }, ["ballot", "noir"]);
    const fetchMock = stubPatch(signedIn);
    const { result } = setup({ user: signedIn });
    await booted(result);
    expect(result.current.brand).toBe("ballot");

    const allowed = new Set<string>(["ballot", "noir", STARTING_BRAND]);
    for (let i = 0; i < 10; i += 1) {
      const before = result.current.brand;
      shuffleOnce(result);
      expect(allowed.has(result.current.brand!)).toBe(true);
      expect(result.current.brand).not.toBe(before);
    }
    await act(async () => undefined);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("fo:discovered")).toBeNull();
  });

  it("is a no-op while one theme is enabled", async () => {
    const { result } = setup({ enabled: [STARTING_BRAND] });
    await booted(result);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    expect(shuffleOnce(result)).toBe("none");
    expect(result.current.brand).toBe(STARTING_BRAND);
    expect(window.localStorage.getItem("fo:shuffle")).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does nothing before the session check finishes or when it failed", async () => {
    const loading = setup({ authLoading: true });
    expect(shuffleOnce(loading.result)).toBe("none");
    loading.unmount();
    const failed = setup({ sessionError: "down" });
    expect(shuffleOnce(failed.result)).toBe("none");
    expect(window.localStorage.getItem("fo:shuffle")).toBeNull();
  });

  describe("cross-fade", () => {
    function stubTransition() {
      let finish: () => void = () => undefined;
      const ran: string[] = [];
      const start = vi.fn((update: () => Promise<void>) => {
        ran.push("started");
        void update();
        return { finished: new Promise<void>((resolve) => (finish = resolve)) };
      });
      Object.defineProperty(document, "startViewTransition", {
        configurable: true,
        value: start
      });
      return { start, finish: () => finish(), ran };
    }

    function stubMotion(reduce: boolean) {
      vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
          matches: reduce && query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined
        }))
      );
    }

    it("swaps inside a view transition and ignores clicks until it finishes", async () => {
      stubMotion(false);
      const transition = stubTransition();
      const { result } = setup();
      await booted(result);
      const before = result.current.brand;

      expect(shuffleOnce(result)).toBe("shuffled");
      expect(transition.start).toHaveBeenCalledTimes(1);
      expect(result.current.brand).not.toBe(before);
      const during = result.current.brand;

      expect(shuffleOnce(result)).toBe("busy");
      expect(result.current.brand).toBe(during);
      expect(transition.start).toHaveBeenCalledTimes(1);

      await act(async () => {
        transition.finish();
      });
      expect(shuffleOnce(result)).toBe("shuffled");
      expect(transition.start).toHaveBeenCalledTimes(2);
    });

    it("swaps instantly with reduced motion", async () => {
      stubMotion(true);
      const transition = stubTransition();
      const { result } = setup();
      await booted(result);
      const before = result.current.brand;
      expect(shuffleOnce(result)).toBe("shuffled");
      expect(transition.start).not.toHaveBeenCalled();
      expect(result.current.brand).not.toBe(before);
      expect(root().dataset.brand).toBe(result.current.brand);
      // Not busy: the next click shuffles again at once.
      expect(shuffleOnce(result)).toBe("shuffled");
    });
  });
});
