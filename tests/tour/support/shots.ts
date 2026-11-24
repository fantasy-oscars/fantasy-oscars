import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { selectAppearance } from "../../visual/support/page";
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN } from "../../e2e/support/stack";
import { PASSWORD, type World } from "./world";
import { createRun, linkLatest, outputOverride } from "./run-dirs.mjs";

let outputDir = "";

/** The directory of the run in progress; set by `startRun`. */
export function runDir() {
  if (!outputDir) throw new Error("startRun() has not been called");
  return outputDir;
}

export type Shot = {
  file: string;
  section: string;
  title: string;
  caption: string;
  persona: string;
  path: string;
  day: number;
};

const shots: Shot[] = [];
let section = "";
let day = 0;

/**
 * Starts a run in its own directory under tests/tour/runs and points `latest` at it, so
 * earlier runs survive. TOUR_OUTPUT_DIR names one directory instead, emptied first.
 */
export function startRun() {
  const override = outputOverride();
  if (override) {
    rmSync(override, { recursive: true, force: true });
    mkdirSync(override, { recursive: true });
    outputDir = override;
  } else {
    outputDir = createRun();
    linkLatest(outputDir);
  }
  shots.length = 0;
}

export function beginSection(name: string) {
  section = name;
}

export function setDay(next: number) {
  day = next;
}

/** Waits for the page to settle: fonts loaded, no busy regions, no skeletons. */
export async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll(
          '[aria-busy="true"], .mantine-Skeleton-root, [data-loading="true"]'
        ).length === 0,
      undefined,
      { timeout: 10_000 }
    )
    .catch(() => undefined);
  // Let entrance transitions and live updates land.
  await page.waitForTimeout(600);
}

/** Captures the full page as the next numbered screenshot, with a caption. */
export async function shot(persona: Persona, title: string, caption: string) {
  const { page } = persona;
  await settle(page);
  const n = String(shots.length + 1).padStart(3, "0");
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const file = `${n}-${slug}.png`;
  // A modal dims only the viewport, so a page with one open is captured at viewport size.
  const modalOpen = await page
    .getByRole("dialog")
    .first()
    .isVisible()
    .catch(() => false);
  await page.screenshot({
    path: path.join(runDir(), file),
    fullPage: !modalOpen,
    animations: "disabled"
  });
  shots.push({
    file,
    section,
    title,
    caption,
    persona: persona.name,
    path: new URL(page.url()).pathname + new URL(page.url()).search,
    day
  });
  writeManifest();
}

export function writeManifest() {
  writeFileSync(
    path.join(runDir(), "manifest.json"),
    JSON.stringify({ generated: new Date().toISOString(), shots }, null, 2)
  );
}

export type Persona = {
  name: string;
  context: BrowserContext;
  page: Page;
  token: string | null;
};

/** A browser for one person, in the tour's theme (Refined Gold, light), on desktop. */
export async function persona(
  browser: Browser,
  name: string,
  world: World
): Promise<Persona> {
  const context = await browser.newContext({
    baseURL: E2E_WEB_ORIGIN,
    viewport: { width: 1440, height: 900 },
    colorScheme: "light"
  });
  await selectAppearance(context, "refined-gold", "light");
  await serveFilmSearch(context, world);
  const page = await context.newPage();
  return { name, context, page, token: null };
}

/** Signs a persona in through the login form. */
export async function signInThroughForm(p: Persona, username = p.name) {
  await p.page.goto("/login");
  await p.page.getByLabel("Username").fill(username);
  await p.page.getByLabel("Password").fill(PASSWORD);
  await p.page.getByRole("button", { name: "Sign in" }).click();
  await p.page.getByRole("button", { name: username }).waitFor();
  await captureToken(p);
}

export async function captureToken(p: Persona) {
  const cookie = (await p.context.cookies(E2E_API_ORIGIN)).find(
    (c) => c.name === "auth_token"
  );
  if (!cookie) throw new Error(`${p.name} has no auth cookie`);
  p.token = cookie.value;
}

/** TMDB is not reachable: film search answers from the seeded films. */
async function serveFilmSearch(context: BrowserContext, world: World) {
  const films = Object.entries(world.tmdbIds);
  await context.route(`${E2E_API_ORIGIN}/contenders/films/search**`, async (route) => {
    const cors = {
      "access-control-allow-origin": E2E_WEB_ORIGIN,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With"
    };
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    const q = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase();
    return route.fulfill({
      status: 200,
      headers: cors,
      json: {
        results: films
          .filter(([title]) => title.toLowerCase().includes(q))
          .map(([title, tmdbId]) => ({
            tmdb_id: tmdbId,
            title,
            release_year: 2034,
            poster_url: null
          }))
      }
    });
  });
}
