import { expect, type Page } from "@playwright/test";
import type { BrandId } from "@fantasy-oscars/shared/brands";
// A relative path: the repo root does not depend on the shared package, and the
// catalog is plain data with no imports.
import { BRAND_CATALOG } from "../../packages/shared/src/brands";
import { SUPER_ADMIN_HEADER, waitForAnimationsIdle } from "./support/page";
import { FIXED_NOW, type PersonaKey, type VisualSeed } from "./support/seed";

/**
 * The visual matrix is data. The suite has three tiers that each test one thing; this
 * file holds the screenshot tier's matrix and the screens the assertion tier walks.
 *
 * - screenshots (screens.spec.ts, baselines.spec.ts): only what a person judges by eye.
 *   The bespoke Home page (`home-logged-in`) for every brand x mode x viewport, and one
 *   sample card per brand x mode at desktop (SAMPLE_SELECTOR, a region of the specimen).
 *   `home-logged-out` is not captured: it has the same layout and slots, differing in the
 *   header's controls and the content of the seasons slot, both covered by the other tiers.
 *   Modes come from the brand catalog, so a brand that declares one mode gets one.
 * - tolerances (tolerances.spec.ts, tolerances/): every representative component on the
 *   specimen (`/__specimen`) measured against declared bounds in every brand x mode x
 *   viewport. No baselines.
 * - assertions (assertions.spec.ts): rules checked against theme parameters, and the
 *   screens checked once (docs/adr/0008-rule-based-visual-assertions.md). The screen
 *   sweep walks every row of SCREENS, the specimen and the draft stress data at both
 *   viewports in the probe-stress theme only (assertions/sweep.ts): layout checks, plus
 *   the contrast pairs each screen paints, recorded in assertions/pairs.json. Per theme
 *   (a brand in one mode): the contrast rule over those pairs (no browser), the geometry
 *   limits against the probe-stress theme, and the specimen backstop. No baselines.
 *
 * Add a row to SCREENS for a new screen (it joins the sweep); add an entry to BRANDS
 * when a brand lands (its modes come from the brand catalog, and screens.spec.ts pins
 * each with selectAppearance). A new brand or mode adds Home and sample-card cells and
 * per-theme assertion tests; the sweep does not grow.
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
  /**
   * Themes `/auth/me` reports as discovered for a signed-in persona (the account's
   * Appearance section lists them). Defaults to none.
   */
  discovered?: readonly BrandId[];
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
export function rewriteDraftSnapshot(
  page: Page,
  edit: (draft: Record<string, unknown>, snapshot: Record<string, unknown>) => void
): Promise<void> {
  return page.route("**/drafts/*/snapshot", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      server_time?: string;
      draft: Record<string, unknown>;
    };
    body.server_time = FIXED_NOW;
    edit(body.draft, body);
    await route.fulfill({ response, json: body });
  });
}

/**
 * Reports the signed-in persona as a super admin on this screen, so the gated
 * full awards season is offered. Other screens keep the persona's own role.
 */
export function asSuperAdmin(page: Page): Promise<void> {
  return page.route("**/auth/me", (route) =>
    route.fallback({
      headers: { ...route.request().headers(), [SUPER_ADMIN_HEADER]: "1" }
    })
  );
}

/** The countdown screen's edit: a 90 s timer with 4 s left. */
export function countdownSnapshot(draft: Record<string, unknown>) {
  draft.pick_timer_seconds = 90;
  draft.pick_deadline_at = new Date(Date.parse(FIXED_NOW) + 4000).toISOString();
}

/**
 * The season draft room mid-draft, from the finished draft of the in-season
 * league: picks 1 to 3 stand (pick 2 missed), and casey (seat 1) is on the
 * clock for pick 4 with 42 s left.
 */
/** Reports the viewer's claims as locked: the window is being processed. */
function lockCircuitClaims(page: Page): Promise<void> {
  return page.route("**/circuit-leagues/*/claims", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...body, locked: true } });
  });
}

/**
 * Gives the first pick of the viewer's roster points at two ceremonies (a
 * nomination at one, a win at the other), with the roster total to match,
 * so its nominee card shows the breakdown.
 */
function scoreFirstRosterPick(page: Page): Promise<void> {
  return page.route("**/circuit-leagues/*/roster", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = (await response.json()) as {
      entries: Array<{ points: { total: number; by_ceremony: unknown[] } }>;
      points_total: number;
    };
    const first = body.entries[0];
    if (first) {
      first.points = {
        total: 3,
        by_ceremony: [
          { ceremony_id: 1, ceremony_name: "Guild Awards", nomination: 1, win: 0 },
          { ceremony_id: 2, ceremony_name: "Critics Prize", nomination: 0, win: 2 }
        ]
      };
      body.points_total += 3;
    }
    await route.fulfill({ response, json: body });
  });
}

function rewriteCircuitDraftLive(page: Page): Promise<void> {
  return page.route("**/circuit-leagues/*/draft", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = (await response.json()) as {
      draft: Record<string, unknown>;
      seats: Array<{ seat_number: number; member_id: number }>;
      picks: Array<{ pick_number: number; outcome: string; selection_id: number | null }>;
      selections: Array<{ id: number }>;
      on_the_clock: unknown;
      server_time: string;
    };
    const picks = body.picks
      .filter((p) => p.pick_number <= 3)
      .map((p) =>
        p.pick_number === 2 ? { ...p, outcome: "MISSED", selection_id: null } : p
      );
    Object.assign(body.draft, {
      status: "IN_PROGRESS",
      pick_timer_seconds: 90,
      current_pick_number: 4,
      pick_deadline_at: new Date(Date.parse(FIXED_NOW) + 42_000).toISOString(),
      completed_at: null
    });
    body.picks = picks;
    body.selections = body.selections.filter((s) =>
      picks.some((p) => p.selection_id === s.id)
    );
    body.on_the_clock = {
      pick_number: 4,
      original_pick_number: 4,
      seat_number: 1,
      member_id: body.seats.find((s) => s.seat_number === 1)!.member_id,
      supplemental: false
    };
    body.server_time = FIXED_NOW;
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
    id: "forgot-password",
    persona: null,
    path: () => "/forgot-password",
    ready: { text: "Send reset link" },
    fullPage: true
  },
  {
    id: "reset-password",
    persona: null,
    // Any token shows the form; it is only checked when the form is submitted.
    path: () => "/reset-password?token=visual-check",
    ready: { text: "Save new password" },
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
    id: "league-detail-member",
    persona: "casey",
    path: (s) => `/leagues/${s.leagues.main}`,
    ready: { text: "Friday Night Film Club" },
    fullPage: true
  },
  {
    // Both kinds open, neither chosen: the kind card alone.
    id: "season-create-choice",
    persona: "avery",
    beforeNavigate: asSuperAdmin,
    path: (s) => `/leagues/${s.matineeLeague}/sunday-matinee-club/seasons/new`,
    ready: { text: "Kind of season" },
    fullPage: true
  },
  {
    // The main league already plays every open awards season.
    id: "season-create-full-unavailable",
    persona: "avery",
    beforeNavigate: asSuperAdmin,
    path: (s) => `/leagues/${s.leagues.main}/friday-night-film-club/seasons/new`,
    ready: { text: "This league already plays every open awards season." },
    fullPage: true
  },
  {
    id: "season-create-ceremony",
    persona: "avery",
    path: (s) =>
      `/leagues/${s.matineeLeague}/sunday-matinee-club/seasons/new?kind=ceremony`,
    ready: { text: "Seconds per pick" },
    fullPage: true
  },
  {
    // One open awards season: a static row, then the four settings summaries.
    id: "season-create-full",
    persona: "avery",
    beforeNavigate: asSuperAdmin,
    path: (s) => `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/new?kind=full`,
    ready: { text: "Snake draft, 90 seconds per pick." },
    fullPage: true
  },
  {
    // Two open awards seasons: picked by name, the newest first.
    id: "season-create-full-select",
    persona: "avery",
    beforeNavigate: asSuperAdmin,
    path: (s) => `/leagues/${s.matineeLeague}/sunday-matinee-club/seasons/new?kind=full`,
    ready: { text: "1 point per nomination, 2 per win." },
    fullPage: true
  },
  {
    id: "season-create-full-scoring-open",
    persona: "avery",
    beforeNavigate: asSuperAdmin,
    path: (s) => `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/new?kind=full`,
    ready: { text: "1 point per nomination, 2 per win." },
    prepare: async (page) => {
      await page.getByRole("button", { name: "Edit scoring" }).click();
      await expect(page.getByRole("dialog", { name: "Scoring" })).toBeVisible();
      await waitForAnimationsIdle(page);
    }
  },
  {
    // A grouped event's ceremonies as its switch description, at phone width.
    id: "season-create-full-events-open",
    persona: "avery",
    beforeNavigate: asSuperAdmin,
    path: (s) => `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/new?kind=full`,
    ready: { text: "All 2 events count equally." },
    viewports: ["mobile"],
    prepare: async (page) => {
      await page.getByRole("button", { name: "Edit events" }).click();
      await expect(page.getByRole("dialog", { name: "Events" })).toBeVisible();
      await waitForAnimationsIdle(page);
    }
  },
  {
    id: "full-season-setup",
    persona: "avery",
    path: (s) =>
      `/leagues/${s.leagues.main}/friday-night-film-club/seasons/full/${s.circuitLeagues.main}`,
    ready: { text: "Lock season" },
    fullPage: true
  },
  {
    id: "full-season-member",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.main}/friday-night-film-club/seasons/full/${s.circuitLeagues.main}`,
    ready: { text: "Leave season" },
    fullPage: true
  },
  {
    // A player's read-only modal: saved values as rows and a single Close.
    id: "full-season-member-view-open",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.main}/friday-night-film-club/seasons/full/${s.circuitLeagues.main}`,
    ready: { text: "Leave season" },
    viewports: ["desktop"],
    prepare: async (page) => {
      await page.getByRole("button", { name: "View roster" }).click();
      await expect(page.getByRole("dialog", { name: "Roster" })).toBeVisible();
      await waitForAnimationsIdle(page);
    }
  },
  {
    // In season, free agency open: Add/drop leads the header group.
    id: "full-season-in-season",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}`,
    ready: { text: "Add/drop" },
    fullPage: true
  },
  {
    // The window's claims are being processed: the caption under the header group.
    id: "full-season-processing",
    persona: "blake",
    path: (s) =>
      `/leagues/${s.leagues.third}/late-show-society/seasons/full/${s.circuitLeagues.inWindow}`,
    beforeNavigate: (page) => lockCircuitClaims(page),
    ready: { text: "Claims are being processed." },
    fullPage: true
  },
  {
    // A full roster (3 of 3) with free agency open: drops, the drop select and the picker.
    id: "circuit-roster-own",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/roster`,
    ready: { text: "Add a free agent" },
    fullPage: true
  },
  {
    id: "circuit-roster-window",
    persona: "blake",
    path: (s) =>
      `/leagues/${s.leagues.third}/late-show-society/seasons/full/${s.circuitLeagues.inWindow}/roster`,
    ready: { text: "Free agency is closed while waiver claims are open" },
    fullPage: true
  },
  {
    // Another player's roster: pills with points, no actions and no free agency panel.
    id: "circuit-roster-other",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/roster`,
    ready: { text: "Add a free agent" },
    prepare: async (page) => {
      await page.getByRole("textbox", { name: "Player" }).click();
      await page.getByRole("option").filter({ hasNotText: "(you)" }).first().click();
      await expect(page.getByRole("heading", { name: /'s roster$/ })).toBeVisible();
      await waitForAnimationsIdle(page);
    },
    fullPage: true
  },
  {
    // A pick's nominee card with its points: two ceremony lines and a total.
    id: "circuit-roster-tooltip",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/roster`,
    beforeNavigate: (page) => scoreFirstRosterPick(page),
    ready: { text: "Add a free agent" },
    viewports: ["desktop"],
    prepare: async (page) => {
      await page.locator(".circuit-rosterRow .dr-pill").first().focus();
      await expect(page.getByText("Points for casey")).toBeVisible();
      await waitForAnimationsIdle(page);
    }
  },
  {
    // Before the draft: the room with the contender form, facts, players and
    // settings in the middle and a three-row queue in the staging rail.
    id: "circuit-draft-lobby",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.main}/friday-night-film-club/seasons/full/${s.circuitLeagues.main}/draft`,
    ready: { text: "Prepare your picks" },
    fullPage: true
  },
  {
    // A finished draft: the board by player alone, as the ceremony room's roster view.
    id: "circuit-draft-board",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/draft`,
    ready: { text: "The draft is complete" },
    fullPage: true
  },
  {
    // The finished board by category: category cards of ledger rows.
    id: "circuit-draft-board-category",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/draft`,
    ready: { text: "The draft is complete" },
    prepare: async (page) => {
      await page.getByText("By category", { exact: true }).click();
      await expect(page.getByRole("region", { name: "Best Picture" })).toBeVisible();
    },
    fullPage: true
  },
  {
    // Mid-draft: casey on the clock, the form and the staging rail's Draft
    // buttons live, a missed pick in the draft history.
    id: "circuit-draft-room",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/draft`,
    ready: { text: "You're on the clock." },
    beforeNavigate: (page) => rewriteCircuitDraftLive(page),
    fullPage: true
  },
  {
    // The same draft on a phone with the staging rail open from the bottom bar.
    id: "circuit-draft-staging",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/draft`,
    ready: { text: "You're on the clock." },
    viewports: ["mobile"],
    beforeNavigate: (page) => rewriteCircuitDraftLive(page),
    prepare: async (page) => {
      await page.getByRole("button", { name: "Staging" }).click();
      await expect(page.getByTestId("circuit-staging-note")).toBeVisible();
    },
    fullPage: true
  },
  {
    // casey on the clock with a queued contender armed: the inverted pill and the confirm toast.
    id: "circuit-draft-armed",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/draft`,
    ready: { text: "You're on the clock." },
    viewports: ["desktop"],
    beforeNavigate: (page) => rewriteCircuitDraftLive(page),
    prepare: async (page) => {
      await page
        .getByRole("list", { name: "Your queue" })
        .locator('.dr-pill-btn:not([aria-disabled="true"])')
        .first()
        .click();
      await expect(page.getByText("Confirm draft pick")).toBeVisible();
      await waitForAnimationsIdle(page);
    },
    fullPage: true
  },
  {
    // The same draft on a phone: a staging pill's nominee card with Draft, Move and Remove.
    id: "circuit-draft-card",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/draft`,
    ready: { text: "You're on the clock." },
    viewports: ["mobile"],
    beforeNavigate: (page) => rewriteCircuitDraftLive(page),
    prepare: async (page) => {
      await page.getByRole("button", { name: "Staging" }).click();
      await page
        .getByRole("list", { name: "Your queue" })
        .locator(".dr-pill-btn:not(.is-muted)")
        .first()
        .click();
      await expect(page.getByRole("dialog", { name: "Nominee details" })).toBeVisible();
      await waitForAnimationsIdle(page);
    }
  },
  {
    id: "circuit-transactions",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/transactions`,
    ready: { text: "Free agent" },
    fullPage: true
  },
  {
    // No window open: the note, rolling priority and one processed window's results.
    id: "circuit-waivers",
    persona: "casey",
    path: (s) =>
      `/leagues/${s.leagues.second}/weekend-cinephiles/seasons/full/${s.circuitLeagues.inSeason}/waivers`,
    ready: { text: "There is no waiver window open" },
    fullPage: true
  },
  {
    // Inside a window: blake's two ranked claims (one chipped, one with a drop) and the picker.
    id: "circuit-waivers-window",
    persona: "blake",
    path: (s) =>
      `/leagues/${s.leagues.third}/late-show-society/seasons/full/${s.circuitLeagues.inWindow}/waivers`,
    ready: { text: "Claim a contender" },
    fullPage: true
  },
  {
    // The window's claims are being processed: the locked note and read-only claim pills.
    id: "circuit-waivers-processing",
    persona: "blake",
    path: (s) =>
      `/leagues/${s.leagues.third}/late-show-society/seasons/full/${s.circuitLeagues.inWindow}/waivers`,
    beforeNavigate: (page) => lockCircuitClaims(page),
    ready: { text: "being processed" },
    fullPage: true
  },
  {
    // A finished season's Guild Awards points by player: jo's dropped pick dashed.
    id: "circuit-points-player",
    persona: "drew",
    path: (s) =>
      `/leagues/${s.leagues.fourth}/golden-hour-guild/seasons/full/${s.circuitLeagues.complete}/standings/${s.ceremonies.completed}`,
    ready: { selector: '[aria-label="Points by player"] .dr-pill.is-dropped' },
    fullPage: true
  },
  {
    // The same points by category: Nominations and Wins columns, gold pills in Wins.
    id: "circuit-points-category",
    persona: "drew",
    path: (s) =>
      `/leagues/${s.leagues.fourth}/golden-hour-guild/seasons/full/${s.circuitLeagues.complete}/standings/${s.ceremonies.completed}?view=category`,
    ready: { selector: '[aria-label="Points by category"] .dr-pill' },
    fullPage: true
  },
  {
    // A complete season: Final results with every scoring contender and its players.
    id: "circuit-standings-final",
    persona: "drew",
    path: (s) =>
      `/leagues/${s.leagues.fourth}/golden-hour-guild/seasons/full/${s.circuitLeagues.complete}/standings`,
    ready: { selector: '[aria-label="All scoring contenders"] .dr-pill' },
    fullPage: true
  },
  {
    // Final rosters: jo's card carries the points from the pick dropped mid-season.
    id: "circuit-standings-final-rosters",
    persona: "drew",
    path: (s) =>
      `/leagues/${s.leagues.fourth}/golden-hour-guild/seasons/full/${s.circuitLeagues.complete}/standings?results=rosters`,
    ready: { text: "from picks dropped during the season" },
    fullPage: true
  },
  {
    // A member of the Circuit competition: Home lists it beside the Seasons.
    id: "home-with-circuit",
    persona: "casey",
    path: () => "/",
    ready: { text: "Awards Season 2035" },
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
    // Blake's narrower header shows the token strip; its avatars and the tab sit on
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
    ready: { selector: '.drh-tab[data-tone^="countdown"], .dr-mobileBar.is-countdown' },
    beforeNavigate: (page) => rewriteDraftSnapshot(page, countdownSnapshot),
    prepare: async (page) => {
      await expect(page.locator(".drh-tabHeadlineText").first()).toHaveText("4s left");
      await waitForAnimationsIdle(page);
    }
  },
  {
    id: "draft-paused",
    persona: "avery",
    path: (s) => `/drafts/${s.drafts.live}`,
    ready: { selector: ".drh-tab, .dr-mobileBar" },
    beforeNavigate: (page) =>
      rewriteDraftSnapshot(page, (draft) => {
        draft.status = "PAUSED";
      }),
    prepare: async (page) => {
      await expect(page.locator(".drh-tabHeadlineText").first()).toHaveText("Paused");
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
    id: "account-appearance-open",
    persona: "long",
    path: () => "/account",
    ready: { selector: "#appearance" },
    discovered: ["ballot", "noir", "festival"],
    fullPage: true,
    // The Random list, opened from the field: focus stays on it, as it does for a keyboard user.
    prepare: async (page) => {
      const field = page.getByRole("textbox", { name: "Themes to include" });
      // Near the top of the viewport, so the list opens below the field.
      await field.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await field.click();
      await page.getByRole("listbox").waitFor();
    }
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

export type Brand = {
  /** Used in baseline file names; `default` keeps the unprefixed names. */
  id: string;
  slug: BrandId;
};

/** Brands multiply the tiers that are per brand. */
export const BRANDS: readonly Brand[] = [
  { id: "default", slug: "refined-gold" },
  { id: "red-carpet", slug: "red-carpet" },
  { id: "noir", slug: "noir" },
  { id: "ballot", slug: "ballot" },
  { id: "festival", slug: "festival" },
  { id: "technicolor", slug: "technicolor" },
  { id: "lightbox", slug: "lightbox" }
];

/** The modes a brand offers, from the brand catalog (primary first); one per base. */
export function modesOf(brand: Brand): readonly Mode[] {
  const entry = BRAND_CATALOG.find((e) => e.id === brand.slug);
  if (!entry) throw new Error(`brand ${brand.slug} is not in the brand catalog`);
  return entry.modes.map((m) => m.base);
}

/**
 * The page the probe-stress theme is painted over: the default brand, whose slug the
 * generated blocks target. The theme itself is never selected.
 */
export const SWEEP_BRAND: Brand = { id: "default", slug: "refined-gold" };

/** The component specimen page; a screen like any other, walked by the assertion tier. */
export const SPECIMEN_SCREEN: ScreenDef = {
  id: "specimen",
  persona: null,
  path: () => "/__specimen",
  ready: { selector: '[data-specimen-ready="true"]' }
};

/**
 * The sample card: a region of the specimen (a card with heading, body, status chip, primary
 * and secondary button and an input) stamped with `data-specimen-sample`. The screenshot
 * tier captures this element, not the page.
 */
export const SAMPLE_SELECTOR = "[data-specimen-sample]";

/** Tall pages are cut here so one long screen cannot dominate baseline size. */
export const MAX_PAGE_HEIGHT = 2400;

const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as ViewportName[];

/** Baseline file name within the screen's directory (no extension). */
export function snapshotName(brand: Brand, mode: Mode, viewport: ViewportName) {
  const parts = brand.id === "default" ? [] : [brand.id];
  return [...parts, mode, viewport].join("-");
}

export type Tier = "home" | "sample";

/** One screenshot: a screen in a brand, mode and viewport, and where its baseline lives. */
export type Capture = {
  tier: Tier;
  screen: ScreenDef;
  brand: Brand;
  mode: Mode;
  viewport: ViewportName;
  /** Capture only this element (the sample card) instead of the page. */
  region?: string;
  /** Path of the baseline under tests/visual/__screenshots__. */
  snapshot: [string, string];
};

/** The Home screen the screenshot tier captures (a signed-in persona). */
const HOME_SCREEN_ID = "home-logged-in";

/** Directory of the sample card baselines. */
const SAMPLE_DIR = "sample-card";

function capture(
  tier: Tier,
  screen: ScreenDef,
  brand: Brand,
  mode: Mode,
  viewport: ViewportName,
  region?: string
): Capture {
  return {
    tier,
    screen,
    brand,
    mode,
    viewport,
    region,
    snapshot: [
      tier === "sample" ? SAMPLE_DIR : screen.id,
      `${snapshotName(brand, mode, viewport)}.png`
    ]
  };
}

function homeCaptures(): Capture[] {
  const screen = SCREENS.find((s) => s.id === HOME_SCREEN_ID);
  if (!screen) throw new Error(`${HOME_SCREEN_ID} is not in SCREENS`);
  return BRANDS.flatMap((brand) =>
    modesOf(brand).flatMap((mode) =>
      VIEWPORT_NAMES.map((viewport) => capture("home", screen, brand, mode, viewport))
    )
  );
}

function sampleCaptures(): Capture[] {
  return BRANDS.flatMap((brand) =>
    modesOf(brand).map((mode) =>
      capture("sample", SPECIMEN_SCREEN, brand, mode, "desktop", SAMPLE_SELECTOR)
    )
  );
}

/** Every screenshot the suite takes: Home, then the sample cards. */
export function allCaptures(): Capture[] {
  return [...homeCaptures(), ...sampleCaptures()];
}
