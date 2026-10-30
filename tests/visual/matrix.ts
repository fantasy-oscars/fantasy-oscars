import { expect, type Page } from "@playwright/test";
import type { PersonaKey, VisualSeed } from "./support/seed";

/**
 * The visual matrix is data: screens x modes x viewports x brands. Add a row to
 * SCREENS for a new screen; add an entry to BRANDS when a brand lands (select it in
 * screens.spec.ts next to the colour scheme) and every screen is captured for it too.
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

/** Brands multiply the matrix. Only the current look exists today. */
export const BRANDS = [{ id: "default" }] as const;
export type Brand = (typeof BRANDS)[number];

/** Tall pages are cut here so one long screen cannot dominate baseline size. */
export const MAX_PAGE_HEIGHT = 2400;

/** Baseline file name within the screen's directory (no extension). */
export function snapshotName(brand: Brand, mode: Mode, viewport: ViewportName) {
  const parts = brand.id === "default" ? [] : [brand.id];
  return [...parts, mode, viewport].join("-");
}
