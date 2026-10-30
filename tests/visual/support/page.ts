import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
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
export async function settle(page: Page, inFlight: () => number) {
  await page.waitForLoadState("networkidle");
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
  for (let i = 0; quiet < QUIET_POLLS; i++) {
    if (i > MAX_POLLS) {
      throw new Error("page never settled (requests in flight or DOM still changing)");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
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
