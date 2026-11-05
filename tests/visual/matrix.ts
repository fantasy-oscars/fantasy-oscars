import { expect, type Page } from "@playwright/test";
import type { BrandId } from "@fantasy-oscars/shared/brands";
import { waitForAnimationsIdle } from "./support/page";
import { FIXED_NOW, type PersonaKey, type VisualSeed } from "./support/seed";

/**
 * The visual matrix is data, in tiers that each test one thing:
 *
 * - layout: every screen in the default brand, light, both viewports (dark only for
 *   DARK_KEY_SCREENS). A screen's structure does not depend on the brand.
 * - specimen: one page of every component and state (`/__specimen`) per brand, in both
 *   modes at desktop and the brand's primary mode on a phone. A brand's look does not
 *   depend on the screen.
 * - brand-screens: the few screens whose composition differs per brand (BRAND_SCREEN_IDS),
 *   every brand, primary mode, both viewports.
 *
 * Add a row to SCREENS for a new screen (it joins the layout tier); add an entry to
 * BRANDS and PRIMARY_MODE when a brand lands (screens.spec.ts selects it next to the
 * colour scheme).
 */

export type ScreenDef = {
  /** Directory name of the baseline images; also the test title. */
  id: string;
  /** Persona whose session cookie is used; `null` is logged out. */
  persona: PersonaKey | null;
  path: (seed: VisualSeed) => string;
  /** Visible text or selector proving the screen has rendered its data. */
  ready: { text: string } | { selector: string };
  /**
   * Optional setup before navigation (route rewrites). Runs after the clock is frozen and
   * before `page.goto`.
   */
  beforeNavigate?: (page: Page, seed: VisualSeed) => Promise<void>;
  /** Optional interaction after the page is ready (open a menu, pick a saved plan). */
  prepare?: (page: Page) => Promise<void>;
  /**
   * Capture the whole page (height capped at MAX_PAGE_HEIGHT) instead of only the
   * viewport. Use for document-style pages; screens that scroll internally (the
   * draft room) are captured at viewport size.
   */
  fullPage?: boolean;
  /** Viewports to capture; defaults to both. */
  viewports?: readonly ViewportName[];
  /** Cap on a full-page capture's height in px; defaults to MAX_PAGE_HEIGHT. */
  maxHeight?: number;
  /**
   * Regions painted over before comparing. For a capture whose subject is elsewhere
   * but whose layout puts half-pixel edges in the frame (see draft-live-hover-match).
   */
  maskSelectors?: readonly string[];
};

/**
 * Rewrites the draft snapshot the room loads. The clock is frozen at FIXED_NOW, so the
 * snapshot's own stamp is set to the same instant: the client's server-clock offset is
 * then zero and a deadline of FIXED_NOW + 4 s always reads "4s left".
 */
function rewriteDraftSnapshot(
  page: Page,
  edit: (draft: Record<string, unknown>) => void
): Promise<void> {
  return page.route("**/drafts/*/snapshot", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      server_time?: string;
      draft: Record<string, unknown>;
    };
    body.server_time = FIXED_NOW;
    edit(body.draft);
    await route.fulfill({ response, json: body });
  });
}

export const SCREENS: ScreenDef[] = [
  {
    id: "home-logged-out",
    persona: null,
    path: () => "/",
    ready: { text: "Fantasy Oscars" },
    fullPage: true
  },
  {
    id: "home-logged-in",
    persona: "avery",
    path: () => "/",
    ready: { text: "Friday Night Film Club" },
    fullPage: true
  },
  {
    id: "home-new-user",
    persona: "newcomer",
    path: () => "/",
    ready: { selector: "main" },
    fullPage: true
  },
  {
    id: "login",
    persona: null,
    path: () => "/login",
    ready: { text: "Sign in" },
    fullPage: true
  },
  {
    id: "register",
    persona: null,
    path: () => "/register",
    ready: { text: "Create account" },
    fullPage: true
  },
  {
    id: "leagues-list",
    persona: "avery",
    path: () => "/leagues",
    ready: { text: "Weekend Cinephiles" },
    fullPage: true
  },
  {
    id: "leagues-empty",
    persona: "newcomer",
    path: () => "/leagues",
    ready: { selector: "main" },
    fullPage: true,
    // The blur falloff of the header's first icon button (outside its box, 3 px wide)
    // rendered one of two ways on CI runners, 1 pixel apart; locally it is stable and the
    // header's geometry is whole pixels, so there is nothing to snap. The header is
    // compared on every other signed-in screen.
    maskSelectors: [".site-header"]
  },
  {
    id: "league-detail",
    persona: "avery",
    path: (s) => `/leagues/${s.leagues.main}`,
    ready: { text: "Friday Night Film Club" },
    fullPage: true
  },
  {
    id: "season-live",
    persona: "avery",
    path: (s) => `/seasons/${s.seasons.live}`,
    ready: { text: "Participants" },
    fullPage: true
  },
  {
    id: "season-completed",
    persona: "blake",
    path: (s) => `/seasons/${s.seasons.completed}`,
    ready: { text: "Participants" },
    fullPage: true
  },
  {
    id: "season-pending",
    persona: "avery",
    path: (s) => `/seasons/${s.seasons.pending}`,
    ready: { text: "Participants" },
    fullPage: true
  },
  {
    id: "draft-live-your-turn",
    persona: "avery",
    path: (s) => `/drafts/${s.drafts.live}`,
    ready: { selector: "main" }
  },
  {
    id: "draft-live-not-your-turn",
    persona: "blake",
    path: (s) => `/drafts/${s.drafts.live}`,
    ready: { selector: "main" }
  },
  {
    id: "draft-live-armed",
    persona: "avery",
    path: (s) => `/drafts/${s.drafts.live}`,
    ready: { selector: "main" },
    viewports: ["desktop"],
    prepare: async (page) => {
      // Dispatch the click instead of moving the mouse: pointer moves are broadcast as
      // a live cursor that the other personas' captures of this draft would show.
      await page
        .locator('.dr-pill-btn[aria-label^="Best Picture: "]:not(.is-muted)')
        .first()
        .dispatchEvent("click");
      await expect(
        page.getByRole("button", { name: "Confirm draft pick" })
      ).toBeVisible();
      await waitForAnimationsIdle(page);
    }
  },
  {
    id: "draft-live-hover-match",
    persona: "blake",
    path: (s) => `/drafts/${s.drafts.live}`,
    ready: { selector: "main" },
    viewports: ["desktop"],
    // Blake's narrower header shows the token strip; its avatars and the buckle sit on
    // half-pixel offsets and rasterise to one of two anti-aliased results per load.
    maskSelectors: [".dr-header"],
    prepare: async (page) => {
      // The participant strip is hidden in avery's wider header, so blake views and
      // hovers avery's token. Where the header is too narrow for the strip to list the
      // participants (some brands), it collapses to one unlabelled token for the player
      // on the clock, who is avery. A dispatched mouseover raises the participant hover
      // without a pointer move (see draft-live-armed).
      await page
        .locator(
          '.drh-tokenWrap[aria-label="avery"], .drh-strip > .drh-tokenWrap:not([aria-label])'
        )
        .first()
        .dispatchEvent("mouseover");
      await expect(page.locator(".dr-pill.is-hoverMatch").first()).toBeVisible();
      await waitForAnimationsIdle(page);
    }
  },
  {
    id: "draft-live-focus-disabled",
    persona: "blake",
    path: (s) => `/drafts/${s.drafts.live}`,
    ready: { selector: "main" },
    viewports: ["desktop"],
    maskSelectors: [".dr-header"],
    prepare: async (page) => {
      await page.getByRole("button", { name: "Category: Best Picture" }).focus();
      await page.keyboard.press("Enter");
      await expect(
        page.locator('.dr-pill-btn[aria-label^="Best Picture: "]').first()
      ).toBeFocused();
      await waitForAnimationsIdle(page);
    }
  },
  {
    id: "draft-live-countdown",
    persona: "avery",
    path: (s) => `/drafts/${s.drafts.live}`,
    ready: { selector: ".drh-buckle.is-countdown, .dr-mobileBar.is-countdown" },
    beforeNavigate: (page) =>
      rewriteDraftSnapshot(page, (draft) => {
        draft.pick_timer_seconds = 90;
        draft.pick_deadline_at = new Date(Date.parse(FIXED_NOW) + 4000).toISOString();
      }),
    prepare: async (page) => {
      await expect(page.locator(".drh-buckleCenter, .drm-clockText").first()).toHaveText(
        "4s left"
      );
      await waitForAnimationsIdle(page);
    }
  },
  {
    id: "draft-paused",
    persona: "avery",
    path: (s) => `/drafts/${s.drafts.live}`,
    ready: { selector: ".drh-buckle, .dr-mobileBar" },
    beforeNavigate: (page) =>
      rewriteDraftSnapshot(page, (draft) => {
        draft.status = "PAUSED";
      }),
    prepare: async (page) => {
      await expect(page.locator(".drh-buckleCenter, .drm-clockText").first()).toHaveText(
        "Paused"
      );
      await waitForAnimationsIdle(page);
    }
  },
  {
    id: "draft-completed",
    persona: "jo",
    path: (s) => `/drafts/${s.drafts.completed}`,
    ready: { selector: "main" }
  },
  {
    id: "draft-plans",
    persona: "avery",
    path: (s) => `/ceremonies/${s.ceremonies.upcoming}/draft-plans`,
    ready: { text: "Configure your personal draft order" },
    prepare: async (page) => {
      await page.getByRole("textbox", { name: "Plan name" }).click();
      await page.getByRole("option", { name: "My shortlist" }).click();
      await expect(page.getByRole("button", { name: "Download" })).toBeEnabled();
    },
    fullPage: true
  },
  {
    id: "ceremonies-index",
    persona: "avery",
    path: () => "/ceremonies",
    ready: { text: "Golden Reel Awards 2035" },
    fullPage: true
  },
  {
    id: "ceremony-detail",
    persona: "avery",
    path: (s) => `/ceremonies/${s.ceremonies.upcoming}`,
    ready: { text: "Best Picture" },
    fullPage: true
  },
  {
    id: "ceremony-detail-results",
    persona: "avery",
    path: (s) => `/ceremonies/${s.ceremonies.completed}`,
    ready: { text: "Best Picture" },
    fullPage: true
  },
  {
    id: "account",
    persona: "long",
    path: () => "/account",
    ready: { selector: "main" },
    fullPage: true
  },
  {
    id: "admin-home",
    persona: "admin",
    path: () => "/admin",
    ready: { selector: "main" },
    fullPage: true
  },
  {
    id: "admin-films",
    persona: "admin",
    path: () => "/admin/films",
    ready: { selector: "main" },
    fullPage: true
  },
  {
    id: "admin-ceremony-nominees",
    persona: "admin",
    path: (s) => `/admin/ceremonies/${s.ceremonies.upcoming}/nominees`,
    ready: { text: "Best Picture" },
    fullPage: true
  },
  {
    id: "not-found",
    persona: null,
    path: (s) => `/no-such-page-${s.missingId}`,
    ready: { selector: "main" },
    fullPage: true
  }
];

export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 }
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

/**
 * Screens that overflow a 390px viewport horizontally and are not yet fixed. The
 * phone guard skips them so the rest stay protected; remove an id once its overflow
 * is fixed. Empty: every screen is guarded.
 */
export const KNOWN_PHONE_OVERFLOW: readonly string[] = [];

/** Layout tier: screens that also get a dark-mode capture (dark changes colour, not structure). */
export const DARK_KEY_SCREENS = [
  "home-logged-in",
  "league-detail",
  "draft-live-your-turn",
  "draft-completed",
  "ceremony-detail",
  "login"
] as const;

export type Brand = {
  /** Used in baseline file names; `default` keeps the unprefixed names. */
  id: string;
  slug: BrandId;
};

/** Brands multiply the tiers that are per brand. The default brand also owns the layout tier. */
export const BRANDS: readonly Brand[] = [
  { id: "default", slug: "refined-gold" },
  { id: "red-carpet", slug: "red-carpet" },
  { id: "noir", slug: "noir" },
  { id: "ballot", slug: "ballot" },
  { id: "festival", slug: "festival" },
  { id: "technicolor", slug: "technicolor" },
  { id: "lightbox", slug: "lightbox" }
];

/**
 * The mode each brand is designed in first (the canvas titles in the brand design source).
 * Phone specimens and the brand-screens tier capture only this mode.
 */
export const PRIMARY_MODE: Record<BrandId, Mode> = {
  "refined-gold": "light",
  "red-carpet": "dark",
  ballot: "light",
  noir: "dark",
  festival: "light",
  technicolor: "light",
  lightbox: "light"
};

/**
 * Brand-screens tier: ids of SCREENS captured for every brand in its primary mode, both
 * viewports. These are the screens whose composition differs per brand: Home (logged out
 * and in) and the live draft room.
 */
export const BRAND_SCREEN_IDS: readonly string[] = [
  "home-logged-out",
  "home-logged-in",
  "draft-live-your-turn"
];

/** The component specimen page; a screen like any other, captured by its own tier. */
export const SPECIMEN_SCREEN: ScreenDef = {
  id: "specimen",
  persona: null,
  path: () => "/__specimen",
  ready: { selector: '[data-specimen-ready="true"]' },
  fullPage: true,
  // Tall by design: every component family and state on one page.
  maxHeight: 12000
};

/** Tall pages are cut here so one long screen cannot dominate baseline size. */
export const MAX_PAGE_HEIGHT = 2400;

/** Baseline file name within the screen's directory (no extension). */
export function snapshotName(brand: Brand, mode: Mode, viewport: ViewportName) {
  const parts = brand.id === "default" ? [] : [brand.id];
  return [...parts, mode, viewport].join("-");
}

export type Tier = "layout" | "specimen" | "brand-screens";

/** One screenshot: a screen in a brand, mode and viewport, and where its baseline lives. */
export type Capture = {
  tier: Tier;
  screen: ScreenDef;
  brand: Brand;
  mode: Mode;
  viewport: ViewportName;
  /** Path of the baseline under tests/visual/__screenshots__. */
  snapshot: [string, string];
};

const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as ViewportName[];
const DEFAULT = BRANDS[0]!;

function capture(
  tier: Tier,
  screen: ScreenDef,
  brand: Brand,
  mode: Mode,
  viewport: ViewportName
): Capture {
  return {
    tier,
    screen,
    brand,
    mode,
    viewport,
    snapshot: [screen.id, `${snapshotName(brand, mode, viewport)}.png`]
  };
}

function viewportsOf(screen: ScreenDef) {
  return VIEWPORT_NAMES.filter((v) => !screen.viewports || screen.viewports.includes(v));
}

function layoutCaptures(): Capture[] {
  return SCREENS.flatMap((screen) =>
    MODES.filter(
      (mode) =>
        mode === "light" || (DARK_KEY_SCREENS as readonly string[]).includes(screen.id)
    ).flatMap((mode) =>
      viewportsOf(screen).map((viewport) =>
        capture("layout", screen, DEFAULT, mode, viewport)
      )
    )
  );
}

function specimenCaptures(): Capture[] {
  return BRANDS.flatMap((brand) =>
    MODES.flatMap((mode) =>
      VIEWPORT_NAMES.filter(
        (viewport) => viewport === "desktop" || mode === PRIMARY_MODE[brand.slug]
      ).map((viewport) => capture("specimen", SPECIMEN_SCREEN, brand, mode, viewport))
    )
  );
}

function brandScreenCaptures(): Capture[] {
  const screens = SCREENS.filter((s) => BRAND_SCREEN_IDS.includes(s.id));
  return BRANDS.flatMap((brand) =>
    screens.flatMap((screen) =>
      viewportsOf(screen).map((viewport) =>
        capture("brand-screens", screen, brand, PRIMARY_MODE[brand.slug], viewport)
      )
    )
  );
}

/**
 * Every screenshot the suite takes. A cell two tiers both name (the default brand's
 * primary-mode Home, say) is captured once, by the first tier.
 */
export function allCaptures(): Capture[] {
  const seen = new Set<string>();
  return [...layoutCaptures(), ...specimenCaptures(), ...brandScreenCaptures()].filter(
    (c) => {
      const key = c.snapshot.join("/");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
  );
}

/**
 * One assertion-tier test: a brand at a viewport over a slice of that viewport's
 * screens. Desktop runs axe on every screen and takes about twice as long as mobile, so
 * it is cut into two halves to keep every cell near the same length. Longest first, so
 * the runner starts the long cells early.
 */
export type AssertionCell = {
  brand: Brand;
  viewport: ViewportName;
  part: number;
  parts: number;
  screens: ScreenDef[];
};

export function assertionCells(): AssertionCell[] {
  const cells = BRANDS.flatMap((brand) =>
    VIEWPORT_NAMES.flatMap((viewport) => {
      const screens = [...SCREENS, SPECIMEN_SCREEN].filter(
        (s) => !s.viewports || s.viewports.includes(viewport)
      );
      const parts = viewport === "desktop" ? 2 : 1;
      const size = Math.ceil(screens.length / parts);
      return Array.from({ length: parts }, (_, part) => ({
        brand,
        viewport,
        part,
        parts,
        screens: screens.slice(part * size, (part + 1) * size)
      }));
    })
  );
  const weight = (c: AssertionCell) => (c.viewport === "desktop" ? 2 : 1);
  return cells.sort((a, b) => weight(b) - weight(a));
}
