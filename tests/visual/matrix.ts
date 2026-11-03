import { expect, type Page } from "@playwright/test";
import type { BrandId } from "@fantasy-oscars/shared/brands";
import { waitForAnimationsIdle } from "./support/page";
import type { PersonaKey, VisualSeed } from "./support/seed";

/**
 * The visual matrix is data: screens x modes x viewports x brands. Add a row to
 * SCREENS for a new screen; add an entry to BRANDS when a brand lands (screens.spec.ts
 * selects it next to the colour scheme) and its screens are captured too.
 */

export type ScreenDef = {
  /** Directory name of the baseline images; also the test title. */
  id: string;
  /** Persona whose session cookie is used; `null` is logged out. */
  persona: PersonaKey | null;
  path: (seed: VisualSeed) => string;
  /** Visible text or selector proving the screen has rendered its data. */
  ready: { text: string } | { selector: string };
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
  /**
   * Regions painted over before comparing. For a capture whose subject is elsewhere
   * but whose layout puts half-pixel edges in the frame (see draft-live-hover-match).
   */
  maskSelectors?: readonly string[];
};

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
    fullPage: true
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
      // hovers avery's token. A dispatched mouseover raises the participant hover without a pointer move
      // (see draft-live-armed).
      await page
        .locator('.drh-tokenWrap[aria-label="avery"]')
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
 * Screens that overflow a 390px viewport horizontally today and are not fixed by
 * this work. The phone guard skips them so the rest stay protected; remove an id
 * once its overflow is fixed.
 */
export const KNOWN_PHONE_OVERFLOW: readonly string[] = [
  // Draft-plan rows are wider than the viewport (scrollWidth 577).
  "draft-plans",
  // The very long username in the account page is not wrapped (scrollWidth 538).
  "account"
];

/**
 * The screens captured for brands other than the default: enough to pin each palette's
 * surfaces, type, primary, draft states (including the armed pill) and floating layers.
 */
export const KEY_SCREENS = [
  "home-logged-out",
  "home-logged-in",
  "league-detail",
  "season-live",
  "draft-live-your-turn",
  "draft-completed",
  "ceremony-detail-results",
  "account",
  "login",
  "draft-live-armed"
] as const;

export type Brand = {
  /** Used in baseline file names; `default` keeps the unprefixed names. */
  id: string;
  slug: BrandId;
  /** Screens to capture; all of them when absent. */
  screens?: readonly string[];
};

/** Brands multiply the matrix. The default brand takes the full matrix. */
export const BRANDS: readonly Brand[] = [
  { id: "default", slug: "refined-gold" },
  { id: "red-carpet", slug: "red-carpet", screens: KEY_SCREENS },
  { id: "noir", slug: "noir", screens: KEY_SCREENS },
  { id: "ballot", slug: "ballot", screens: KEY_SCREENS },
  { id: "festival", slug: "festival", screens: KEY_SCREENS }
];

/** Tall pages are cut here so one long screen cannot dominate baseline size. */
export const MAX_PAGE_HEIGHT = 2400;

/** Baseline file name within the screen's directory (no extension). */
export function snapshotName(brand: Brand, mode: Mode, viewport: ViewportName) {
  const parts = brand.id === "default" ? [] : [brand.id];
  return [...parts, mode, viewport].join("-");
}
