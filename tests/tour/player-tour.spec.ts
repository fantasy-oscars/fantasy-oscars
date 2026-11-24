import { writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { E2E_API_ORIGIN } from "../e2e/support/stack";
import { advanceDays, closeDb, runWaivers } from "./support/clock";
import {
  OUTPUT_DIR,
  beginSection,
  captureToken,
  persona,
  resetOutput,
  setDay,
  shot,
  signInThroughForm,
  writeManifest,
  type Persona
} from "./support/shots";
import {
  ADMIN_USERNAME,
  CATEGORIES,
  CEREMONIES,
  CIRCUIT_NAME,
  FILMS,
  LEAGUE_NAME,
  MATES,
  NEWCOMER,
  PASSWORD,
  YOU,
  apiLogin,
  tourApi,
  type Category,
  type Film,
  type World
} from "./support/world";

/**
 * One season from a player's side, screenshotting every screen they meet:
 * first visit, sign-up and invites, a league with a single-ceremony season and a
 * full awards season, both drafts, free agency, a waiver window with claims, its
 * resolution, nominations and winners scoring, and the final standings.
 * Admin screens are not captured; admin work is done through the API.
 */

const world = JSON.parse(process.env.TOUR_WORLD ?? "{}") as World;
const PICK_CLOCK_SECONDS = 20;
const ROSTER_SIZE = 4;

/** Steps that only decorate a screenshot: a miss is logged and the tour goes on. */
const misses: string[] = [];
async function attempt(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    misses.push(`${label}: ${message}`);
    console.warn(`tour: skipped "${label}": ${message}`);
  }
}

function as<T>(p: Persona, method: string, path: string, body?: unknown) {
  return tourApi<T>(method, path, body, p.token ?? undefined);
}

async function visit(p: Persona, path: string) {
  await p.page.goto(path);
  await p.page.waitForLoadState("domcontentloaded");
}

/** Every selection, most valuable first (nominated most often across both ceremonies). */
function selectionValueOrder(): Array<{ category: Category; film: Film; id: number }> {
  const all = CATEGORIES.flatMap((category) =>
    FILMS.map((film) => ({
      category,
      film,
      id: world.selections[category][film],
      value: CEREMONIES.reduce(
        (n, c) =>
          n +
          (c.nominees[category].includes(film) ? 2 : 0) +
          (c.winners[category] === film ? 3 : 0),
        0
      )
    }))
  );
  return all.sort((a, b) => b.value - a.value || a.id - b.id);
}

test("a player's season, screen by screen", async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  resetOutput();
  const admin = await apiLogin(ADMIN_USERNAME);
  const adminPost = (path: string, body: unknown = {}) =>
    tourApi("POST", path, body, admin);
  const rebuildScores = () =>
    adminPost(`/admin/circuits/${world.circuitId}/scores/rebuild`);
  let today = 0;
  const advance = async (days: number) => {
    await advanceDays(world.databaseUrl, world.circuitId, days);
    today += days;
    setDay(today);
    await rebuildScores();
  };

  // ------------------------------------------------------------------ 1. First visit
  beginSection("First visit (signed out)");
  const visitor = await persona(browser, "visitor", world);
  await visit(visitor, "/");
  await shot(visitor, "Home, signed out", "The landing page a new visitor sees.");
  for (const [path, title] of [
    ["/how-it-works", "How it works"],
    ["/about", "About"],
    ["/faq", "FAQ"],
    ["/code-of-conduct", "Code of conduct"],
    ["/terms", "Terms"],
    ["/privacy", "Privacy"],
    ["/disclaimer", "Disclaimer"],
    ["/contact", "Contact"],
    ["/feedback", "Feedback"]
  ] as const) {
    await visit(visitor, path);
    await shot(visitor, title, `Static page ${path}.`);
  }
  await visit(visitor, "/login");
  await shot(visitor, "Sign in", "The sign-in form.");
  await attempt("sign-in error", async () => {
    await visitor.page.getByLabel("Username").fill("nobody");
    await visitor.page.getByLabel("Password").fill("wrong-password");
    await visitor.page.getByRole("button", { name: "Sign in" }).click();
    await visitor.page.waitForTimeout(1200);
    await shot(visitor, "Sign in, wrong password", "What a failed sign-in looks like.");
  });
  await visit(visitor, "/register");
  await shot(visitor, "Create account", "The registration form.");
  await visit(visitor, "/forgot-password");
  await shot(visitor, "Forgot password", "Requesting a reset link.");
  await visit(visitor, "/no-such-page");
  await shot(visitor, "Not found", "The 404 page.");
  await visit(visitor, "/leagues");
  await shot(
    visitor,
    "Guarded page, signed out",
    "A member page visited while signed out."
  );

  // ------------------------------------------------------------------ 2. A league and a single-ceremony season
  beginSection("Starting a league");
  const you = await persona(browser, YOU, world);
  await signInThroughForm(you);
  await visit(you, "/");
  await shot(
    you,
    "Home, signed in, no leagues",
    "Cora's home before she has joined anything."
  );
  await visit(you, "/leagues");
  await shot(you, "My leagues, empty", "The leagues list with nothing in it.");
  await visit(you, "/seasons");
  await shot(you, "My seasons, empty", "The seasons list with nothing in it.");
  await visit(you, "/invites");
  await shot(you, "Invites, empty", "The invites inbox with nothing pending.");
  await visit(you, "/ceremonies");
  await shot(you, "Ceremonies", "Upcoming ceremonies of the awards season.");
  const grand = world.ceremonies[1]!;
  const northlight = world.ceremonies[0]!;
  await visit(you, `/ceremonies/${grand.id}`);
  await shot(
    you,
    "Ceremony nominees",
    `${grand.name}: nominees by category, before the show.`
  );
  await visit(you, `/ceremonies/${grand.id}/draft-plans`);
  await shot(you, "Draft plans", "Personal draft plans for a ceremony.");
  await visit(you, "/account");
  await shot(you, "Account", "Profile, appearance, password and email.");

  await visit(you, "/leagues/new");
  await you.page.getByLabel("Name").fill(LEAGUE_NAME);
  await shot(you, "Create league", "Naming a new league.");
  await you.page.getByRole("button", { name: "Create league" }).click();
  await expect(you.page.getByRole("heading", { name: LEAGUE_NAME })).toBeVisible();
  const leagueUrl = new URL(you.page.url()).pathname;
  const leagueId = Number(leagueUrl.split("/")[2]);
  await shot(
    you,
    "League, new",
    "A brand-new league with no seasons, as its commissioner sees it."
  );

  await you.page.getByRole("link", { name: "Create season" }).click();
  await shot(
    you,
    "Create season, choose kind",
    "Choosing between a single ceremony and a full awards season."
  );
  await you.page.getByRole("radio", { name: "Single ceremony" }).click();
  await expect(you.page.getByRole("radio", { name: "Single ceremony" })).toBeChecked();
  await you.page.getByRole("textbox", { name: "Ceremony" }).click();
  await you.page.getByRole("option", { name: grand.name }).click();
  await you.page.getByRole("switch", { name: "Pick timer" }).uncheck();
  await shot(
    you,
    "Create season, single ceremony",
    "The single-ceremony form, untimed draft."
  );
  await you.page.getByRole("button", { name: "Create season" }).click();
  await expect(you.page.getByRole("heading", { name: grand.name })).toBeVisible();
  const singleUrl = new URL(you.page.url()).pathname;
  await shot(
    you,
    "Single-ceremony season, new",
    "The season page right after creating it."
  );

  beginSection("Inviting friends");
  const pia = await persona(browser, MATES[0], world);
  await signInThroughForm(pia);
  await attempt("invite by username", async () => {
    await you.page.getByRole("button", { name: "Manage participants" }).click();
    const manage = you.page.getByRole("dialog", { name: "Manage participants" });
    await shot(you, "Manage participants", "The participants and invites dialog.");
    await manage.getByLabel("Username").fill(pia.name);
    await you.page.getByRole("option", { name: pia.name }).click();
    await manage.getByRole("button", { name: "Create invite" }).click();
    await you.page.waitForTimeout(800);
    await shot(
      you,
      "Manage participants, invite sent",
      "After inviting Pia by username."
    );
    await you.page.keyboard.press("Escape");
  });
  const seasonId = await you.page.evaluate(
    async (args) => {
      const res = await fetch(`${args.api}/leagues/${args.leagueId}/seasons`, {
        credentials: "include"
      });
      const body = (await res.json()) as { seasons: Array<{ id: number }> };
      return body.seasons[0]?.id ?? null;
    },
    { api: E2E_API_ORIGIN, leagueId }
  );
  expect(seasonId, "single season id").not.toBeNull();

  await visit(pia, "/invites");
  await shot(pia, "Invites, one pending", "Pia's inbox with Cora's invite.");
  await attempt("accept invite", async () => {
    await pia.page.getByRole("button", { name: "Accept" }).click();
    await expect(pia.page.getByRole("heading", { name: grand.name })).toBeVisible();
  });
  // Make sure Pia is in, whichever way the invite went.
  await as(you, "POST", `/seasons/${seasonId}/members`, { username: pia.name }).catch(
    () => undefined
  );
  await visit(pia, singleUrl);
  await shot(
    pia,
    "Single-ceremony season, as a member",
    "The season page from a participant's side."
  );

  // A link invite, claimed by someone who has no account yet.
  const link = await as<{ invite: { token?: string }; token?: string }>(
    you,
    "POST",
    `/seasons/${seasonId}/invites`,
    { label: "Nadia" }
  );
  const inviteToken = link.token ?? link.invite.token;
  const nadia = await persona(browser, NEWCOMER, world);
  await visit(nadia, `/invites/${inviteToken}`);
  await shot(
    nadia,
    "Invite link, signed out",
    "Opening an invite link without an account."
  );
  await visit(nadia, "/register");
  await nadia.page.getByLabel("Username").fill(NEWCOMER);
  await nadia.page.getByLabel("Email").fill(`${NEWCOMER}@example.com`);
  await nadia.page.getByLabel("Password").fill(PASSWORD);
  await shot(nadia, "Create account, filled", "Nadia signing up.");
  await nadia.page.getByRole("button", { name: "Create account" }).click();
  await nadia.page.getByRole("button", { name: NEWCOMER }).waitFor();
  await captureToken(nadia);
  await visit(nadia, `/invites/${inviteToken}`);
  await shot(nadia, "Invite link, signed in", "The invite claim page once signed in.");
  await attempt("claim invite link", async () => {
    await nadia.page
      .getByRole("button", { name: /Accept|Join/ })
      .first()
      .click();
    await nadia.page.waitForTimeout(1500);
  });
  await as(nadia, "POST", `/seasons/invites/token/${inviteToken}/accept`).catch(
    () => undefined
  );
  await visit(nadia, "/");
  await shot(nadia, "Home, new player in a season", "A newcomer's home after joining.");

  const theo = await persona(browser, MATES[1], world);
  const emmy = await persona(browser, MATES[2], world);
  await signInThroughForm(theo);
  await signInThroughForm(emmy);
  for (const p of [theo, emmy]) {
    await as(you, "POST", `/seasons/${seasonId}/members`, { username: p.name });
  }
  await visit(you, singleUrl);
  await shot(you, "Single-ceremony season, full", "Five participants, ready to draft.");
  await visit(you, leagueUrl);
  await shot(
    you,
    "League with a season",
    "The league page listing its single-ceremony season."
  );

  // ------------------------------------------------------------------ 3. The single-ceremony draft
  beginSection("Single-ceremony draft");
  const singleCast = [you, pia, nadia, theo, emmy];
  await visit(you, singleUrl);
  await you.page.getByRole("link", { name: "Enter draft room" }).click();
  await you.page.waitForURL(/\/drafts\/\d+/);
  const singleDraftPath = new URL(you.page.url()).pathname;
  const singleDraftId = Number(singleDraftPath.split("/")[2]);
  await shot(
    you,
    "Draft room, before start (commissioner)",
    "The ceremony draft room before the draft starts."
  );
  await visit(pia, singleDraftPath);
  await shot(
    pia,
    "Draft room, before start (member)",
    "The same room from a participant's side."
  );
  await you.page.getByRole("button", { name: "Start draft" }).click();
  await attempt("confirm start", async () => {
    const dialog = you.page.getByRole("dialog");
    if (await dialog.isVisible({ timeout: 1500 })) {
      await dialog.getByRole("button", { name: "Start draft" }).click();
    }
  });
  await you.page.waitForTimeout(1500);
  for (const p of singleCast.slice(1)) await visit(p, singleDraftPath);

  // Each turn: whoever the server accepts is on the clock. The first of Cora's
  // turns and one of Pia's are captured.
  const grandNominations = CATEGORIES.flatMap((category) =>
    Object.entries(grand.categories[category].nominations).map(([film, id]) => ({
      category,
      film,
      id
    }))
  );
  let youShot = false;
  let waitingShot = false;
  const byUsername = new Map(singleCast.map((p) => [p.name, p]));
  type SingleSnapshot = {
    draft: { status: string; current_pick_number: number | null };
    seats: Array<{ seat_number: number; username: string }>;
  };
  for (const nomination of grandNominations) {
    const snap = await as<SingleSnapshot>(
      you,
      "GET",
      `/drafts/${singleDraftId}/snapshot`
    );
    if (snap.draft.status === "COMPLETED" || snap.draft.current_pick_number === null)
      break;
    // Snake order: odd rounds run seat 1..n, even rounds n..1.
    const n = snap.seats.length;
    const index = (snap.draft.current_pick_number - 1) % n;
    const round = Math.ceil(snap.draft.current_pick_number / n);
    const seatNumber = round % 2 === 1 ? index + 1 : n - index;
    const seat = snap.seats.find((s) => s.seat_number === seatNumber)!;
    const picker = byUsername.get(seat.username);
    if (!picker) throw new Error(`no persona for seat ${JSON.stringify(seat)}`);
    await as(picker, "POST", `/drafts/${singleDraftId}/picks`, {
      nomination_id: nomination.id,
      request_id: `tour-${nomination.id}`
    });
    if (!waitingShot) {
      await pia.page.waitForTimeout(800);
      await shot(
        pia,
        "Draft room, live (member)",
        "Mid-draft from a participant's side."
      );
      waitingShot = true;
    }
    if (!youShot) {
      await you.page.waitForTimeout(800);
      await attempt("expand history", () =>
        you.page
          .getByRole("button", { name: "Expand draft history" })
          .click({ timeout: 3000 })
      );
      await shot(
        you,
        "Draft room, live (commissioner)",
        "Mid-draft with the history expanded."
      );
      youShot = true;
    }
  }
  await you.page.waitForTimeout(1500);
  await shot(
    you,
    "Draft room, complete",
    "The finished draft: every pick on the roster board."
  );

  // ------------------------------------------------------------------ 4. The full awards season: setup
  beginSection("Full awards season: setup");
  await visit(you, leagueUrl);
  await you.page.getByRole("link", { name: "Create season" }).click();
  const full = you.page.getByRole("radio", { name: "Full awards season" });
  await full.click();
  await expect(full).toBeChecked();
  await attempt("choose awards season", async () => {
    const box = you.page.getByRole("textbox", { name: "Awards season" });
    if (await box.count()) {
      await box.click();
      await you.page.getByRole("option", { name: CIRCUIT_NAME, exact: true }).click();
    }
  });
  await shot(
    you,
    "Create season, full awards season",
    "The full-season form with its summary rows."
  );
  for (const name of ["Edit events", "Edit scoring", "Edit roster", "Edit draft"]) {
    await attempt(`modal ${name}`, async () => {
      await you.page.getByRole("button", { name }).click({ timeout: 3000 });
      await you.page.getByRole("dialog").waitFor();
      await shot(
        you,
        `Create season, ${name.replace("Edit ", "")} settings`,
        `The ${name.replace("Edit ", "")} settings modal.`
      );
      await you.page.keyboard.press("Escape");
      await you.page
        .getByRole("dialog")
        .waitFor({ state: "hidden", timeout: 3000 })
        .catch(async () => {
          await you.page.getByRole("button", { name: "Discard" }).click();
        });
    });
  }
  await you.page.getByRole("button", { name: "Create season" }).click();
  await you.page.waitForURL(/\/seasons\/full\/\d+$/);
  const fullUrl = new URL(you.page.url()).pathname;
  const fullId = Number(fullUrl.split("/").pop());
  // A short clock and a small roster keep the draft brisk.
  await as(you, "PATCH", `/circuit-leagues/${fullId}/settings`, {
    roster_size: ROSTER_SIZE,
    pick_timer_seconds: PICK_CLOCK_SECONDS,
    auto_draft_enabled: true
  });
  await visit(you, fullUrl);
  await shot(
    you,
    "Full season, setup (commissioner)",
    "The season page in setup, with settings and members."
  );
  await visit(pia, fullUrl);
  await shot(pia, "Full season, not joined", "A league member who has not joined yet.");
  await attempt("join season", async () => {
    await pia.page.getByRole("button", { name: "Join season" }).click({ timeout: 3000 });
    await pia.page.getByText("You’re in this season.").waitFor({ timeout: 5000 });
  });
  await as(pia, "POST", `/circuit-leagues/${fullId}/join`).catch(() => undefined);
  await shot(pia, "Full season, joined", "After joining.");
  for (const p of [theo, emmy]) await as(p, "POST", `/circuit-leagues/${fullId}/join`);

  // Queues: Theo's covers his timed-out pick; Emmy's is empty, so she misses.
  const ranked = selectionValueOrder();
  const queueFor = async (p: Persona, items: Array<{ id: number }>) => {
    for (const s of items)
      await as(p, "POST", `/circuit-leagues/${fullId}/queue`, { selection_id: s.id });
  };
  await queueFor(theo, ranked.slice(8, 14));
  await queueFor(you, ranked.slice(4, 7));
  await as(you, "POST", `/circuit-leagues/${fullId}/initialize`);
  await visit(you, fullUrl);
  await shot(you, "Full season, initialised", "Membership locked; the draft can start.");
  await visit(you, leagueUrl);
  await shot(you, "League with two seasons", "The league page with both seasons.");

  // ------------------------------------------------------------------ 5. The full-season draft
  beginSection("Full awards season: draft");
  const draftPath = `${fullUrl}/draft`;
  const fullCast = [you, pia, theo, emmy];
  for (const p of fullCast) await visit(p, draftPath);
  await shot(you, "Season draft lobby (commissioner)", "The lobby with Start draft.");
  await shot(pia, "Season draft lobby (member)", "The lobby from a member's side.");
  await you.page.getByRole("button", { name: "Start draft" }).click();
  await attempt("lobby start confirm", async () => {
    const dialog = you.page.getByRole("dialog", { name: "Start the draft?" });
    await dialog.waitFor({ timeout: 3000 });
    await shot(you, "Start the draft?", "The confirmation before starting.");
    await dialog.getByRole("button", { name: "Start draft" }).click();
  });
  await expect(you.page.getByRole("heading", { name: "Draft room" })).toBeAttached();

  type Snapshot = {
    draft: { id: number; status: string; current_pick_number: number | null };
    seats: Array<{ seat_number: number; username: string }>;
    on_the_clock: {
      pick_number: number;
      seat_number: number;
      supplemental: boolean;
    } | null;
    selections?: Array<{ id: number }>;
  };
  const snapshot = () => as<Snapshot>(you, "GET", `/circuit-leagues/${fullId}/draft`);
  const drafted = new Set<number>();
  const byName = new Map(fullCast.map((p) => [p.name, p]));
  let emmyMisses = 0;
  let theoTimedOut = false;
  let youUiPick = false;
  let waitingCaptured = false;
  let supplementalCaptured = false;

  for (let guard = 0; guard < 40; guard += 1) {
    const snap = await snapshot();
    if (snap.draft.status === "COMPLETED") break;
    const clock = snap.on_the_clock!;
    const seat = snap.seats.find((s) => s.seat_number === clock.seat_number)!;
    const player = byName.get(seat.username)!;
    for (const s of snap.selections ?? []) drafted.add(s.id);

    if (!waitingCaptured && player !== pia) {
      await shot(
        pia,
        "Season draft, waiting",
        `Pia watching while ${player.name} is on the clock.`
      );
      waitingCaptured = true;
    }
    if (clock.supplemental && !supplementalCaptured) {
      await shot(
        you,
        "Season draft, supplemental round",
        "The make-up round for missed picks."
      );
      supplementalCaptured = true;
    }

    // Emmy misses her first pick and its supplemental (a chip); Theo times out once
    // (auto-draft takes from his queue).
    const waitsOut =
      (player === emmy && emmyMisses < 2) || (player === theo && !theoTimedOut);
    if (waitsOut) {
      if (player === emmy) emmyMisses += 1;
      else theoTimedOut = true;
      if (player === emmy && emmyMisses === 1) {
        await shot(
          emmy,
          "Season draft, on the clock with an empty queue",
          "Emmy on the clock with nothing queued."
        );
      }
    } else if (player === you && !youUiPick) {
      youUiPick = true;
      await shot(
        you,
        "Season draft, your turn",
        "Cora on the clock: the pick panel in the middle of the room."
      );
      const target = ranked.find(
        (s) => !drafted.has(s.id) && s.category === "Best Picture"
      )!;
      await attempt("draft through picker", async () => {
        const panel = you.page.getByRole("region", { name: "Your pick" });
        const picker = panel.getByRole("group", { name: "Choose a contender" });
        await picker.getByRole("textbox", { name: "Category" }).click();
        await you.page
          .getByRole("option", { name: target.category, exact: true })
          .click();
        await picker
          .getByRole("textbox", { name: "Search films" })
          .fill(target.film.slice(0, 4));
        await you.page.waitForTimeout(800);
        await shot(
          you,
          "Season draft, searching contenders",
          "Choosing a category and searching films."
        );
        await picker
          .getByRole("list", { name: "Films" })
          .getByRole("button", { name: target.film })
          .click();
        await shot(
          you,
          "Season draft, contender chosen",
          "A contender staged, ready to draft."
        );
        await picker.getByRole("button", { name: `Draft ${target.film}` }).click();
      });
    } else {
      const target = ranked.find((s) => !drafted.has(s.id))!;
      await as(player, "POST", `/circuit-drafts/${snap.draft.id}/picks`, {
        selection_id: target.id,
        request_id: `tour-${snap.draft.id}-${clock.pick_number}`
      }).catch(() => undefined);
    }
    await expect
      .poll(
        async () => {
          const s = await snapshot();
          return s.draft.status === "COMPLETED" ? -1 : s.draft.current_pick_number;
        },
        { timeout: (PICK_CLOCK_SECONDS + 20) * 1000 }
      )
      .not.toBe(clock.pick_number);
    if (guard === 5) {
      await attempt("expand season draft history", () =>
        you.page
          .getByRole("button", { name: "Expand draft history" })
          .click({ timeout: 3000 })
      );
      await shot(you, "Season draft, mid-draft", "Mid-draft with the history expanded.");
    }
  }
  await you.page.waitForTimeout(1500);
  await shot(
    you,
    "Season draft, complete (by player)",
    "The finished board by player, with From queue and the supplemental marks."
  );
  await attempt("board by category", async () => {
    await you.page.getByText("By category", { exact: true }).click({ timeout: 3000 });
    await shot(
      you,
      "Season draft, complete (by category)",
      "The finished board by category."
    );
  });

  // ------------------------------------------------------------------ 6. In season, before the first scoring day
  beginSection("In season: free agency (day 0)");
  setDay(0);
  await visit(you, fullUrl);
  await shot(you, "Full season, in season", "The season page once the draft is done.");
  await visit(you, `${fullUrl}/roster`);
  await shot(
    you,
    "Your roster, free agency open",
    "Cora's roster with free agency open (no waiver window)."
  );
  const emmyId = (await as<{ user: { sub: string } }>(emmy, "GET", "/auth/me")).user.sub;
  await visit(you, `${fullUrl}/roster?member=${emmyId}`);
  await shot(you, "Another player's roster", "Emmy's roster, read only.");
  await attempt("free agent add with drop", async () => {
    await visit(you, `${fullUrl}/roster`);
    const panel = you.page.getByRole("region", { name: /free agen/i });
    await panel.scrollIntoViewIfNeeded({ timeout: 3000 });
    const drop = you.page.getByRole("textbox", { name: /Drop to make room/i });
    await drop.click({ timeout: 3000 });
    await you.page.getByRole("option").first().click();
    const target = selectionValueOrder().find(
      (s) => !drafted.has(s.id) && s.category === "Best Screenplay"
    )!;
    await you.page.getByRole("textbox", { name: "Category" }).click();
    await you.page.getByRole("option", { name: target.category, exact: true }).click();
    await you.page
      .getByRole("textbox", { name: "Search films" })
      .fill(target.film.slice(0, 4));
    await you.page.waitForTimeout(800);
    await shot(
      you,
      "Free agency, picking an add",
      "Choosing a drop and searching free agents."
    );
    await you.page
      .getByRole("list", { name: "Films" })
      .getByRole("button", { name: target.film })
      .click();
    await shot(
      you,
      "Free agency, contender chosen",
      "The chosen free agent, with the drop that makes room."
    );
    await you.page.getByRole("button", { name: `Pick ${target.film}` }).click();
    drafted.add(target.id);
    await you.page.waitForTimeout(1500);
    await shot(
      you,
      "Your roster, after a free-agent add",
      "The roster after the add and drop."
    );
  });
  await attempt("drop confirm", async () => {
    await you.page
      .getByRole("button", { name: /^Drop/ })
      .first()
      .click({ timeout: 3000 });
    await you.page.getByRole("dialog").waitFor({ timeout: 3000 });
    await shot(you, "Drop confirmation", "Confirming a drop.");
    await you.page.getByRole("button", { name: "Cancel" }).click();
  });
  await visit(you, `${fullUrl}/transactions`);
  await shot(
    you,
    "Transactions",
    "The league's transaction log after the draft and a free-agent move."
  );
  await visit(you, `${fullUrl}/waivers`);
  await shot(
    you,
    "Waivers, no window open",
    "Priority and chips (Emmy holds one) while no window is open."
  );
  await visit(you, `${fullUrl}/standings`);
  await shot(
    you,
    "Standings, before scoring",
    "The leaderboard before any ceremony scores."
  );
  await visit(you, "/");
  await shot(you, "Home, in season", "Cora's home with two active seasons.");
  await visit(you, "/seasons");
  await shot(you, "My seasons", "Both seasons listed.");
  await visit(you, "/leagues");
  await shot(you, "My leagues", "The league listed.");

  // ------------------------------------------------------------------ 7. Day 2: nominations, a waiver window opens
  beginSection("Day 2: nominations and an open waiver window");
  await advance(CEREMONIES[0]!.nominationsIn);
  // Free agents, most valuable first.
  const unowned = () => selectionValueOrder().filter((s) => !drafted.has(s.id));
  const free = unowned();
  await visit(you, `${fullUrl}/standings`);
  await shot(
    you,
    "Standings, after nominations",
    `${northlight.name} nominations scored.`
  );
  await visit(you, `${fullUrl}/standings/${northlight.id}`);
  await shot(
    you,
    "Ceremony points, nominations",
    "Who scored what at the first ceremony's nominations."
  );
  await visit(you, `${fullUrl}/roster`);
  await shot(
    you,
    "Your roster, window open",
    "Free agency closed while the waiver window is open."
  );
  await visit(you, `${fullUrl}/waivers`);
  await shot(
    you,
    "Waivers, window open, no claims",
    "An open window before Cora files claims."
  );
  await attempt("claim through picker", async () => {
    const target = free[0]!;
    await you.page.getByRole("textbox", { name: "Category" }).click({ timeout: 3000 });
    await you.page.getByRole("option", { name: target.category, exact: true }).click();
    await you.page
      .getByRole("textbox", { name: "Search films" })
      .fill(target.film.slice(0, 4));
    await you.page.waitForTimeout(800);
    await you.page
      .getByRole("list", { name: "Films" })
      .getByRole("button", { name: target.film })
      .click();
    await you.page
      .getByRole("button", { name: new RegExp(`^(Pick|Claim) ${target.film}`) })
      .click({ timeout: 5000 });
    await you.page.getByRole("dialog").waitFor({ timeout: 8000 });
    await shot(you, "Claim modal", "Filing a claim: conditional drop and chip.");
    await you.page
      .getByRole("dialog")
      .getByRole("button", { name: /Claim|File|Save|Submit/ })
      .last()
      .click();
    await you.page.waitForTimeout(1000);
  });
  // Each claim drops the claimant's least valuable pick, so claims can win.
  const value = new Map(selectionValueOrder().map((s, i) => [s.id, i]));
  const dropFor = async (p: Persona) => {
    const roster = await as<{ entries: Array<{ selection: { id: number } }> }>(
      p,
      "GET",
      `/circuit-leagues/${fullId}/roster`
    );
    return roster.entries
      .map((e) => e.selection.id)
      .sort((a, b) => (value.get(b) ?? 0) - (value.get(a) ?? 0))[0];
  };
  const claim = async (
    p: Persona,
    selectionId: number,
    extra: Record<string, unknown> = {}
  ) =>
    as(p, "POST", `/circuit-leagues/${fullId}/claims`, {
      selection_id: selectionId,
      drop_selection_id: await dropFor(p),
      ...extra
    }).catch((e) => misses.push(`${p.name} claim: ${String(e).slice(0, 160)}`));
  const mine = await as<{ claims?: Array<{ id: number; status: string }> }>(
    you,
    "GET",
    `/circuit-leagues/${fullId}/claims`
  );
  if (!mine.claims?.some((c) => c.status === "PENDING")) await claim(you, free[0]!.id);
  await claim(you, free[1]!.id);
  const emmyClaims = await as<{ chips?: Array<{ id: number }> }>(
    emmy,
    "GET",
    `/circuit-leagues/${fullId}/claims`
  );
  const chip = emmyClaims.chips?.[0];
  await claim(emmy, free[0]!.id, chip ? { chip_id: chip.id } : {});
  await claim(pia, free[1]!.id);
  await claim(theo, free[2]!.id);
  await visit(you, `${fullUrl}/waivers`);
  await shot(
    you,
    "Waivers, your ranked claims",
    "Cora's two claims, ranked, with Edit and Withdraw."
  );
  await visit(emmy, `${fullUrl}/waivers`);
  await shot(emmy, "Waivers, a chipped claim", "Emmy's claim riding on her chip.");
  await visit(you, "/");
  await shot(you, "Home, waiver window open", "Home while a window is open.");

  // ------------------------------------------------------------------ 8. Day 5: the window resolves
  beginSection("Day 5: waivers resolve");
  await advance(3);
  await visit(you, `${fullUrl}/waivers`);
  await shot(you, "Waivers, processing", "The window has closed but has not run yet.");
  await runWaivers(world.databaseUrl);
  await visit(you, `${fullUrl}/waivers`);
  await shot(
    you,
    "Waivers, results",
    "Results: claims in the order they ran, outcomes and reasons, new priority."
  );
  await visit(emmy, `${fullUrl}/waivers`);
  await shot(
    emmy,
    "Waivers, results (chip used)",
    "Emmy's view after her chipped claim."
  );
  await visit(you, `${fullUrl}/transactions`);
  await shot(you, "Transactions, after waivers", "Waiver wins in the log.");
  await visit(you, `${fullUrl}/roster`);
  await shot(
    you,
    "Your roster, free agency reopened",
    "Free agency open again after the run."
  );

  // ------------------------------------------------------------------ 9. Day 7: the first ceremony's winners
  beginSection("Day 7: first ceremony winners");
  await advance(2);
  for (const category of CATEGORIES) {
    const film = CEREMONIES[0]!.winners[category];
    await adminPost("/admin/winners", {
      category_edition_id: northlight.categories[category].editionId,
      nomination_id: northlight.categories[category].nominations[film]
    });
  }
  await adminPost(`/admin/ceremonies/${northlight.id}/finalize-winners`).catch(
    () => undefined
  );
  await rebuildScores();
  await visit(you, `${fullUrl}/standings`);
  await shot(you, "Standings, after first winners", "Win points added.");
  await visit(you, `${fullUrl}/standings/${northlight.id}`);
  await shot(you, "Ceremony points, winners", "The first ceremony's full breakdown.");
  await visit(you, `/ceremonies/${northlight.id}`);
  await shot(you, "Ceremony with winners", `${northlight.name} with winners marked.`);
  await visit(you, `${fullUrl}/waivers`);
  await shot(you, "Waivers, second window open", "The window after the ceremony.");
  await visit(you, fullUrl);
  await shot(you, "Full season, mid-season", "The season page mid-season.");

  // ------------------------------------------------------------------ 10. Day 15: the season ends
  beginSection("Day 15: final ceremony and the end of the season");
  await advance(8);
  await runWaivers(world.databaseUrl);
  for (const category of CATEGORIES) {
    const film = CEREMONIES[1]!.winners[category];
    await adminPost("/admin/winners", {
      category_edition_id: grand.categories[category].editionId,
      nomination_id: grand.categories[category].nominations[film]
    });
  }
  await adminPost(`/admin/ceremonies/${grand.id}/finalize-winners`).catch(
    () => undefined
  );
  await rebuildScores();
  await visit(you, `${fullUrl}/standings`);
  await shot(you, "Standings, final", "Final standings across both ceremonies.");
  await visit(you, `${fullUrl}/standings/${grand.id}`);
  await shot(you, "Ceremony points, final ceremony", `${grand.name} breakdown.`);
  await visit(you, fullUrl);
  await shot(you, "Full season, final", "The season page at the end.");
  await visit(you, singleUrl);
  await shot(
    you,
    "Single-ceremony season, results",
    "The single-ceremony season with final results."
  );
  await visit(you, singleDraftPath);
  await shot(
    you,
    "Draft room, final results",
    "The ceremony draft room showing the final results."
  );
  await visit(pia, singleDraftPath);
  await shot(pia, "Draft room, final results (member)", "The same, from Pia's side.");
  await visit(you, `/ceremonies/${grand.id}`);
  await shot(you, "Final ceremony with winners", `${grand.name} with winners marked.`);
  await visit(you, "/");
  await shot(you, "Home, after the season", "Cora's home once everything has finished.");

  writeManifest();
  writeFileSync(path.join(OUTPUT_DIR, "skipped.txt"), misses.join("\n"));
  if (misses.length)
    console.warn(`tour: ${misses.length} step(s) skipped:\n- ${misses.join("\n- ")}`);
  await closeDb();
});
