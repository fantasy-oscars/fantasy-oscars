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
  type Brand,
  type ScreenDef,
  type ViewportName
} from "../matrix";
import { settle } from "../support/page";

// The draft room stress theme (fixtures/stressBrand.ts) in the assertion tier: the same
// geometry, overflow, clipped-text, overlap and contrast checks, run on the draft screens
// that make its extremes visible. No screenshots and no baselines (chunk 3 adds those).

/** The stress runs borrow the default brand's slug: the generated blocks target it. */
export const STRESS_BRAND: Brand = { id: "stress", slug: stressBrand.id };

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

const STRESS_CSS = `${MONTSERRAT_FACE_CSS}\n${generateBrandCss([stressBrand], stressBrand)}`;

/** Paints the stress theme over a loaded page and waits for its fonts. */
export async function applyStressTheme(page: Page, inFlight: () => number) {
  await page.addStyleTag({ content: STRESS_CSS });
  await page.evaluate(() =>
    Promise.all(
      [400, 500, 600, 700].map((w) => document.fonts.load(`${w} 16px Montserrat`))
    ).then(() => document.fonts.ready)
  );
  await settle(page, inFlight, { quietPolls: 2, networkIdle: false, pollMs: 60 });
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

export function stressScreens(viewport: ViewportName): ScreenDef[] {
  return STRESS_SCREEN_IDS.map((id): ScreenDef => {
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
  }).filter((s) => !s.viewports || s.viewports.includes(viewport));
}
