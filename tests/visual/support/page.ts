import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import type { BrandId } from "@fantasy-oscars/shared/brands";
import type { Mode } from "../matrix";
import { FIXED_NOW, type VisualSeed } from "./seed";
import { E2E_API_ORIGIN } from "../../e2e/support/stack";

const here = path.dirname(fileURLToPath(import.meta.url));
const ICON_FONT = readFileSync(path.join(here, "../fixtures/material-symbols.woff2"));

const COLOR_SCHEME_KEY = "mantine-color-scheme-value";
const ICON_FONT_URL = "https://fonts.gstatic.com/visual-fixture/material-symbols.woff2";

export function readSeed(): VisualSeed {
  const raw = process.env.VISUAL_SEED;
  if (!raw) throw new Error("VISUAL_SEED is not set; global setup did not run");
  return JSON.parse(raw) as VisualSeed;
}

/**
 * The app loads Material Symbols from Google Fonts. Serve a pinned local subset
 * instead so icons never depend on the network, and abort every other request that
 * leaves the machine (recorded so the test can fail on it).
 */
export async function installNetworkGuards(context: BrowserContext) {
  const blocked: string[] = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, async (route) => {
    const url = route.request().url();
    if (url.startsWith("https://fonts.googleapis.com/")) {
      await route.fulfill({
        contentType: "text/css",
        body: `@font-face {
  font-family: "Material Symbols Outlined";
  font-style: normal;
  font-weight: 100 700;
  src: url(${ICON_FONT_URL}) format("woff2");
}`
      });
    } else if (url === ICON_FONT_URL) {
      await route.fulfill({ contentType: "font/woff2", body: ICON_FONT });
    } else if (url.startsWith("https://fonts.gstatic.com/")) {
      // Only the pinned icon subset above is served. A glyph missing from that subset
      // renders as its ligature name in the screenshot (add it to the icon list), and this
      // abort means no fallback font can quietly fill the gap.
      await route.abort();
    } else {
      blocked.push(url);
      await route.abort();
    }
  });
  return blocked;
}

/** Signs the context in as a persona by installing the session cookie. */
export async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([{ name: "auth_token", value: token, url: E2E_API_ORIGIN }]);
}

/** Pins the colour scheme the way the app persists it, before any page script runs. */
export async function setColorScheme(context: BrowserContext, mode: Mode) {
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key!, value!);
    },
    [COLOR_SCHEME_KEY, mode]
  );
}

/**
 * Switches the colour scheme of a loaded page the way a change made in another tab
 * arrives: the stored preference changes and the app's own storage listener repaints.
 * The media preference follows, for CSS that reads it.
 */
export async function switchColorScheme(page: Page, mode: Mode) {
  await page.emulateMedia({ colorScheme: mode });
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key!, value!);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: value,
          storageArea: window.localStorage
        })
      );
    },
    [COLOR_SCHEME_KEY, mode]
  );
  await page.waitForFunction(
    (value) =>
      document.documentElement.getAttribute("data-mantine-color-scheme") === value,
    mode
  );
}

const BRAND_PREFERENCE_KEY = "fo:brand-preference";

/**
 * Pins the brand a capture renders. The browser value covers first paint and signed-out
 * screens; for signed-in personas `/auth/me` is answered with the same brand as the
 * account's saved preference, so the app never copies the browser value to the account
 * (that write would change the shared seed database under parallel captures). Any
 * attempt to save a preference is aborted and recorded; the test asserts the list is
 * empty. Must run before navigation.
 */
export async function selectBrand(context: BrowserContext, brand: BrandId) {
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key!, value!);
    },
    [BRAND_PREFERENCE_KEY, brand]
  );
  await context.route("**/auth/me", async (route) => {
    const response = await route.fetch();
    if (response.status() !== 200) {
      await route.fulfill({ response });
      return;
    }
    const body = (await response.json()) as { user?: Record<string, unknown> };
    if (body.user) body.user.brand_preference = brand;
    const headers = Object.fromEntries(
      Object.entries(response.headers()).filter(
        ([name]) => name !== "content-length" && name !== "content-encoding"
      )
    );
    await route.fulfill({ status: 200, headers, json: body });
  });
  const preferenceWrites: string[] = [];
  await context.route("**/auth/me/preferences", async (route) => {
    preferenceWrites.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort();
  });
  return preferenceWrites;
}

/**
 * Makes time deterministic: Date is frozen at FIXED_NOW, and setInterval never fires.
 * Every interval in the app is a live-update loop (draft clock tick, podium name
 * cycling on ties, heartbeats, cursor spy, countdown beeps) whose firing count would
 * otherwise depend on how long the capture took. One-shot timeouts (debounces,
 * react-query, sockets) still run in real time so the app loads normally.
 * Must run before navigation.
 */
export async function freezeClock(page: Page) {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.addInitScript(() => {
    window.setInterval = (() => 0) as unknown as typeof window.setInterval;
    // Counts DOM changes so settle() can wait for the UI to stop re-rendering.
    const w = window as unknown as { __visualMutations: number };
    w.__visualMutations = 0;
    new MutationObserver((records) => {
      w.__visualMutations += records.length;
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
  });
}

/** Counts API/asset requests that have started but not finished. */
export function trackInFlight(page: Page) {
  const pending = new Set<unknown>();
  page.on("request", (r) => pending.add(r));
  page.on("requestfinished", (r) => pending.delete(r));
  page.on("requestfailed", (r) => pending.delete(r));
  return () => pending.size;
}

const POLL_MS = 100;
const QUIET_POLLS = 10;
const MAX_POLLS = 200;

/**
 * Waits until the page can no longer change under the screenshot: no requests in
 * flight, fonts and images loaded, and no DOM mutation for QUIET_POLLS polls in a
 * row (late data fetches and state updates re-render shortly after network idle).
 */
export async function settle(
  page: Page,
  inFlight: () => number,
  options: { quietPolls?: number; networkIdle?: boolean; pollMs?: number } = {}
) {
  const { quietPolls = QUIET_POLLS, networkIdle = true, pollMs = POLL_MS } = options;
  // networkidle always costs 500ms; the in-flight count below covers requests already.
  if (networkIdle) await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            })
      )
    );
  });
  let quiet = 0;
  for (let i = 0; quiet < quietPolls; i++) {
    if (i > MAX_POLLS) {
      throw new Error("page never settled (requests in flight or DOM still changing)");
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const mutations = await page.evaluate(() => {
      const w = window as unknown as { __visualMutations: number };
      const n = w.__visualMutations;
      w.__visualMutations = 0;
      return n;
    });
    quiet = mutations === 0 && inFlight() === 0 ? quiet + 1 : 0;
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

/**
 * Waits until every running animation and transition has finished, then two frames,
 * so a state raised by a dispatched event (hover, focus, arm) is fully painted.
 */
export async function waitForAnimationsIdle(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const running = document
        .getAnimations()
        .filter((a) => a.playState === "running" || a.playState === "pending");
      if (running.length === 0) break;
      await Promise.allSettled(running.map((a) => a.finished));
    }
    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // The header buckle is positioned from measured widths; wait for them to hold
    // still for several frames so its edge is not captured mid-layout.
    const rectKey = () =>
      Array.from(document.querySelectorAll(".drh-buckle, .drh-tokenWrap"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${r.left}|${r.top}|${r.width}|${r.height}`;
        })
        .join(";");
    let last = rectKey();
    let steady = 0;
    for (let i = 0; i < 120 && steady < 6; i++) {
      await frame();
      const next = rectKey();
      steady = next === last ? steady + 1 : 0;
      last = next;
    }
    await frame();
    await frame();
  });
}
