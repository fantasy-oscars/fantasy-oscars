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

/** Freezes Date so relative and absolute times render the same on every run. */
export async function freezeClock(page: Page) {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
}

/** Waits until the page can no longer change under the screenshot. */
export async function settle(page: Page) {
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
    // Late data fetches and client-side layout settle shortly after network idle:
    // require the page height and text to hold still for 1s before capturing.
    let stableFor = 0;
    let last = "";
    for (let i = 0; stableFor < 10; i++) {
      if (i > 150)
        throw new Error("page never stopped changing (live timer or animation?)");
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      const sig = `${document.documentElement.scrollHeight}:${document.body.innerText.length}`;
      stableFor = sig === last ? stableFor + 1 : 0;
      last = sig;
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}
