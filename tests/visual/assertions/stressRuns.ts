import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { generateBrandCss } from "../../../apps/web/src/theme/brands";
import { stressBrand } from "../fixtures/stressBrand";
import {
  countdownSnapshot,
  rewriteDraftSnapshot,
  SCREENS,
  STRESS_BRAND,
  type ScreenDef,
  type ViewportName
} from "../matrix";
import { settle } from "../support/page";

// The draft room stress theme (fixtures/stressBrand.ts) in the assertion tier: the same
// geometry, overflow, clipped-text, overlap and contrast checks, run on the draft screens
// that make its extremes visible.

export { STRESS_BRAND };

const here = path.dirname(fileURLToPath(import.meta.url));
const MONTSERRAT = readFileSync(
  path.join(here, "../fixtures/montserrat-latin.woff2")
).toString("base64");

/** The pinned Montserrat as a data URL, so no request leaves the machine. */
export const MONTSERRAT_FACE_CSS = `@font-face {
  font-family: "Montserrat";
  font-style: normal;
  font-weight: 400 700;
  src: url(data:font/woff2;base64,${MONTSERRAT}) format("woff2");
}`;

const STRESS_CSS = generateBrandCss([stressBrand], stressBrand);

/**
 * Paints the stress theme over a loaded page. The font is declared and loaded first, so
 * the theme lands in one step: the header decides whether to collapse its wings from what
 * it measures (with hysteresis), and a pass through fallback-font widths could leave it
 * collapsed in one run and open in the next.
 */
export async function applyStressTheme(page: Page, inFlight: () => number) {
  await page.addStyleTag({ content: MONTSERRAT_FACE_CSS });
  await page.evaluate(() =>
    Promise.all(
      [400, 500, 600, 700].map((w) => document.fonts.load(`${w} 16px Montserrat`))
    ).then(() => document.fonts.ready)
  );
  await page.addStyleTag({ content: STRESS_CSS });
  await settle(page, inFlight, { quietPolls: 2, networkIdle: false, pollMs: 60 });
  // The stress header sits near the collapse threshold, where the hysteresis makes the
  // result depend on the widths passed through. Opening the wings at a wide viewport and
  // returning to the real one makes the capture start from the same state every run.
  // The phone header has no wings to collapse, and widening past the 500 px phone
  // breakpoint would remount the room as the desktop layout, so only desktop is widened.
  const size = page.viewportSize();
  if (size && size.width > 500) {
    await page.setViewportSize({ width: size.width + 640, height: size.height });
    await settle(page, inFlight, { quietPolls: 2, networkIdle: false, pollMs: 60 });
    await page.setViewportSize(size);
    await settle(page, inFlight, { quietPolls: 2, networkIdle: false, pollMs: 60 });
  }
}

// Long enough to need truncation in every cell that shows a name (61 characters).
const NAME = "theatre-obsessive-and-world-cinema-completionist-since-1999-and-on";
const stressName = (seat: number) =>
  `${String(seat).padStart(2, "0")}-${NAME}`.slice(0, 61);
const AVATARS = [
  "giraffe",
  "bear",
  "cat",
  "elephant",
  "penguin",
  "whale",
  "owl",
  "rabbit"
];
const SEATS = 12;

/**
 * Twelve seats, every name 61 characters, and no winners, so every seat ties for first on
 * the final podium. The seats the seed does not have are appended with invented ids.
 */
function stressSnapshot(snapshot: Record<string, unknown>) {
  const seats = (snapshot.seats ?? []) as Array<Record<string, unknown>>;
  const next = Array.from({ length: SEATS }, (_, i) => {
    const seat = seats[i] ?? {
      seat_number: i + 1,
      league_member_id: 9000 + i,
      user_id: 9000 + i,
      avatar_key: AVATARS[i % AVATARS.length]
    };
    return { ...seat, username: stressName(i + 1) };
  });
  snapshot.seats = next;
  snapshot.winners = [];
}

/** Draft screens that show the states the stress theme is for. */
const STRESS_SCREEN_IDS = [
  "draft-live-your-turn",
  "draft-live-countdown",
  "draft-completed"
] as const;

/** Assertion tests the stress runs add: one per viewport. */
export const STRESS_TEST_COUNT = 2;

/** A draft screen with its snapshot rewritten to the stress data (12 seats, long names). */
export function stressScreen(id: string): ScreenDef {
  const base = SCREENS.find((s) => s.id === id);
  if (!base) throw new Error(`stress screen ${id} is not in the matrix`);
  return {
    ...base,
    beforeNavigate: (page) =>
      rewriteDraftSnapshot(page, (draft, snapshot) => {
        if (id === "draft-live-countdown") countdownSnapshot(draft);
        stressSnapshot(snapshot);
      })
  };
}

export function stressScreens(viewport: ViewportName): ScreenDef[] {
  return STRESS_SCREEN_IDS.map(stressScreen).filter(
    (s) => !s.viewports || s.viewports.includes(viewport)
  );
}
