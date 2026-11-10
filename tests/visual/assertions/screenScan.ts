import { readFileSync } from "node:fs";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import type { BrandId } from "@fantasy-oscars/shared/brands";
import type { ScreenDef, ViewportName } from "../matrix";
import type { VisualSeed } from "../support/seed";
import { settle, signIn, switchAppearance } from "../support/page";
import { contrastFindings, structuralFindings, type Finding } from "./pageChecks";

const FREEZE_CSS = readFileSync("tests/visual/support/freeze.css", "utf8");
const SCAN_SETTLE = { quietPolls: 3, networkIdle: false, pollMs: 60 } as const;

/** Persona whose cookie the context currently holds; `undefined` before the first screen. */
export type SessionState = { persona: string | null | undefined };

/** Loads a screen the way a screenshot does, up to the point where it can be measured. */
export async function loadScreen(
  page: Page,
  context: BrowserContext,
  screen: ScreenDef,
  seed: VisualSeed,
  inFlight: () => number,
  session: SessionState
) {
  if (session.persona !== screen.persona) {
    await context.clearCookies();
    if (screen.persona) await signIn(context, seed.tokens[screen.persona]);
    session.persona = screen.persona;
  }
  await screen.beforeNavigate?.(page, seed);
  await page.goto(screen.path(seed));
  const marker =
    "text" in screen.ready
      ? page.getByText(screen.ready.text).first()
      : page.locator(screen.ready.selector).first();
  await expect(marker).toBeVisible();
  await screen.prepare?.(page);
  await settle(page, inFlight, SCAN_SETTLE);
  await page.addStyleTag({ content: FREEZE_CSS });
  // Routes added by beforeNavigate belong to this screen only.
  if (screen.beforeNavigate) await page.unrouteAll({ behavior: "ignoreErrors" });
}

/** Repaints a loaded screen in the other colour scheme and waits for it to hold still. */
export async function repaintInMode(
  page: Page,
  brand: BrandId,
  mode: "light" | "dark",
  inFlight: () => number
) {
  await switchAppearance(page, brand, mode);
  await settle(page, inFlight, { ...SCAN_SETTLE, quietPolls: 2 });
}

/**
 * Colour contrast does not depend on width: axe runs on every screen at desktop and on the
 * specimen at both widths. Structural checks run everywhere.
 */
export async function scanScreen(
  page: Page,
  screen: ScreenDef,
  viewport: ViewportName,
  specimenId: string
): Promise<Finding[]> {
  return [
    ...(await structuralFindings(page, viewport === "mobile")),
    ...(viewport === "desktop" || screen.id === specimenId
      ? await contrastFindings(page)
      : [])
  ];
}
