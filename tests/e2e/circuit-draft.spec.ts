import {
  test,
  expect,
  type Browser,
  type Locator,
  type Page,
  type WebSocketRoute
} from "@playwright/test";
import {
  ADMIN_PASSWORD,
  DRAFT_CIRCUIT_NAME,
  DRAFT_PLAYERS,
  type DraftContender
} from "./support/seed";
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN } from "./support/stack";

const PICK_CLOCK_SECONDS = 15;

const draftCircuit = JSON.parse(process.env.E2E_DRAFT_CIRCUIT ?? "{}") as {
  circuitId: number;
  contenders: DraftContender[];
};

type Snapshot = {
  draft: { status: string; current_pick_number: number | null };
  seats: Array<{ seat_number: number; username: string }>;
  picks: Array<{ pick_number: number; seat_number: number; outcome: string }>;
  on_the_clock: {
    pick_number: number;
    seat_number: number;
    supplemental: boolean;
  } | null;
};

type Player = { name: string; page: Page; token: string };

/** Signs a seeded player in, in a browser of their own. */
async function signIn(browser: Browser, username: string): Promise<Player> {
  const context = await browser.newContext({ baseURL: E2E_WEB_ORIGIN });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: username })).toBeVisible();
  const cookie = (await context.cookies(E2E_API_ORIGIN)).find(
    (c) => c.name === "auth_token"
  );
  expect(cookie, "auth cookie").toBeDefined();
  return { name: username, page, token: cookie!.value };
}

async function api<T>(player: Player, method: string, path: string, body?: unknown) {
  const res = await fetch(`${E2E_API_ORIGIN}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${player.token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  expect(res.ok, `${method} ${path} -> ${res.status}`).toBe(true);
  return (await res.json()) as T;
}

/** TMDB is not reachable from the stack: film search answers from the seeded films. */
async function serveFilmSearch(page: Page) {
  const films = [...new Map(draftCircuit.contenders.map((c) => [c.tmdbId, c])).values()];
  await page.route(`${E2E_API_ORIGIN}/contenders/films/search**`, async (route) => {
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
          .filter((f) => f.title.toLowerCase().includes(q))
          .map((f) => ({
            tmdb_id: f.tmdbId,
            title: f.title,
            release_year: null,
            poster_url: null
          }))
      }
    });
  });
}

/**
 * Lets the test cut a page's live connection and then let it back. While cut,
 * reconnect attempts are held open with no server behind them (closing one
 * that never connected can leave the client waiting out its connect timeout);
 * the restore connects them, so the client is back at once.
 */
async function controlSocket(page: Page) {
  let blocked = false;
  const open: WebSocketRoute[] = [];
  const held: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (blocked) {
      held.push(ws);
      return;
    }
    ws.connectToServer();
    open.push(ws);
  });
  return {
    async drop() {
      blocked = true;
      await Promise.all(open.splice(0).map((ws) => ws.close()));
    },
    restore() {
      blocked = false;
      for (const ws of held.splice(0)) {
        ws.connectToServer();
        open.push(ws);
      }
    }
  };
}

function contender(category: string, title: string) {
  const found = draftCircuit.contenders.find(
    (c) => c.category === category && c.title === title
  );
  expect(found, `${category}: ${title}`).toBeDefined();
  return found!;
}

/**
 * Drags `source` by the mouse onto `target`'s place: hover until its nominee
 * card shows (the row is settled), press, move past the 6 px threshold, then
 * on in steps so the list follows, and drop.
 */
async function mouseDrag(page: Page, source: Locator, target: Locator) {
  await source.hover();
  const label = (await source.locator(".dr-pill-text").textContent()) ?? "";
  await expect(
    page.getByRole("tooltip").filter({ hasText: label }).first()
  ).toBeVisible();
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, {
    steps: 4
  });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 4, { steps: 12 });
  await page.mouse.up();
}

/** The player on the clock drafts through the contender form in the middle of the room. */
async function draftThroughPicker(page: Page, category: string, title: string) {
  const panel = page.getByRole("region", { name: "Your pick" });
  await expect(panel.getByTestId("circuit-pick-reason")).toHaveText(/on the clock/);
  const picker = panel.getByRole("group", { name: "Choose a contender" });
  await picker.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: category, exact: true }).click();
  await picker.getByRole("textbox", { name: "Search films" }).fill(title);
  await picker
    .getByRole("list", { name: "Films" })
    .getByRole("button", { name: title })
    .click();
  await picker.getByRole("button", { name: `Draft ${title}` }).click();
}

test("four players run a season draft, with a timeout, an empty queue and a reconnect", async ({
  browser
}) => {
  test.setTimeout(240_000);
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  // Four players: the commissioner and Pia pick by hand, Theo lets his clock
  // run out (auto-draft takes from his queue) and Emmy has an empty queue.
  const [commish, pia, theo, emmy] = await Promise.all(
    DRAFT_PLAYERS.map((name) => signIn(browser, name))
  );
  const players = [commish, pia, theo, emmy];

  // A league with all four, and its full awards season: two rounds, a short
  // clock, auto-draft on.
  const leagueName = `Draft League ${suffix}`;
  const { league } = await api<{ league: { id: number } }>(commish, "POST", "/leagues", {
    name: leagueName
  });
  const { season } = await api<{ season: { id: number } }>(
    commish,
    "POST",
    `/leagues/${league.id}/seasons`,
    { ceremony_id: Number(process.env.E2E_CEREMONY_ID), pick_timer_seconds: null }
  );
  for (const p of [pia, theo, emmy]) {
    await api(commish, "POST", `/seasons/${season.id}/members`, { username: p.name });
  }
  const created = await api<{ circuit_league: { id: number } }>(
    commish,
    "POST",
    `/leagues/${league.id}/circuits`,
    {
      circuit_id: draftCircuit.circuitId,
      settings: {
        roster_size: 2,
        pick_timer_seconds: PICK_CLOCK_SECONDS,
        auto_draft_enabled: true
      }
    }
  );
  const seasonId = created.circuit_league.id;
  for (const p of [pia, theo, emmy]) {
    await api(p, "POST", `/circuit-leagues/${seasonId}/join`);
  }
  const queueOf = (p: Player) =>
    api<{ items: Array<{ selection: { id: number } }> }>(
      p,
      "GET",
      `/circuit-leagues/${seasonId}/queue`
    ).then((q) => q.items.map((i) => i.selection.id));
  for (const title of ["Film A", "Film B"]) {
    await api(theo, "POST", `/circuit-leagues/${seasonId}/queue`, {
      selection_id: contender("Best Director", title).selectionId
    });
  }
  for (const title of ["Film E", "Film F"]) {
    await api(pia, "POST", `/circuit-leagues/${seasonId}/queue`, {
      selection_id: contender("Best Director", title).selectionId
    });
  }
  await api(commish, "POST", `/circuit-leagues/${seasonId}/initialize`);

  const pias = await controlSocket(pia.page);
  const slug = leagueName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  for (const p of players) {
    await serveFilmSearch(p.page);
    await p.page.goto(`/leagues/${league.id}/${slug}/seasons/full/${seasonId}/draft`);
    await expect(p.page.getByRole("heading", { name: "Draft lobby" })).toBeAttached();
  }
  await expect(
    commish.page.getByText(DRAFT_CIRCUIT_NAME, { exact: false })
  ).toBeVisible();

  // The commissioner starts it; every room follows live.
  await commish.page.getByRole("button", { name: "Start draft" }).click();
  await commish.page
    .getByRole("dialog", { name: "Start the draft?" })
    .getByRole("button", { name: "Start draft" })
    .click();
  for (const p of players) {
    await expect(p.page.getByRole("heading", { name: "Draft room" })).toBeAttached();
    // The draft history (collapsed in the lobby, as in the ceremony room)
    // marks the first slot as the one on the clock.
    await p.page.getByRole("button", { name: "Expand draft history" }).click();
    await expect(
      p.page
        .getByRole("region", { name: "Draft history" })
        .locator('[data-active="true"]')
    ).toContainText("1-1");
  }

  // Pia reorders her queue during the draft without a grip: Alt+Arrow on a
  // pill, the row menu and a mouse drag of the pill, each one announced.
  await pia.page.evaluate(() => {
    (window as unknown as { roomMarker: string }).roomMarker = "still here";
  });
  const filmF = contender("Best Director", "Film F").selectionId;
  const filmE = contender("Best Director", "Film E").selectionId;
  const piaQueue = pia.page.getByRole("list", { name: "Your queue" });
  const piaPill = (title: string) =>
    piaQueue.getByRole("button", { name: `Best Director: ${title}`, exact: true });
  await expect(piaQueue.getByRole("button", { name: /^Reorder / })).toHaveCount(0);
  await expect(pia.page.getByText("Drag to reorder.")).toBeVisible();
  const announced = (text: string) =>
    expect(pia.page.getByRole("status").filter({ hasText: text })).toBeAttached();

  await piaPill("Film E").focus();
  await pia.page.keyboard.press("Alt+ArrowDown");
  await announced("Moved Film E to position 2 of 2.");
  await expect.poll(() => queueOf(pia)).toEqual([filmF, filmE]);
  await expect(piaPill("Film E")).toBeFocused();

  await pia.page.getByRole("button", { name: "Actions for Film E" }).click();
  await pia.page.getByRole("menuitem", { name: "Move up" }).click();
  await announced("Moved Film E to position 1 of 2.");
  await expect.poll(() => queueOf(pia)).toEqual([filmE, filmF]);

  await mouseDrag(pia.page, piaPill("Film E"), piaPill("Film F"));
  await announced("Moved Film E to position 2 of 2.");
  await expect.poll(() => queueOf(pia)).toEqual([filmF, filmE]);
  await expect(piaPill("Film E")).toHaveAttribute("aria-pressed", "false");

  const snapshot = () =>
    api<Snapshot>(commish, "GET", `/circuit-leagues/${seasonId}/draft`);
  const byName = new Map(players.map((p) => [p.name, p]));
  const handPicks = ["Film A", "Film B", "Film C", "Film D", "Film E", "Film F"];
  let emmyMissed = false;
  let reconnectChecked = false;

  for (let guard = 0; guard < 12; guard += 1) {
    const snap = await snapshot();
    if (snap.draft.status === "COMPLETED") break;
    const clock = snap.on_the_clock!;
    const seat = snap.seats.find((s) => s.seat_number === clock.seat_number)!;
    const player = byName.get(seat.username)!;

    // Everyone else sees whose pick it is; the form stays open for queueing
    // and staging, and only its Draft action waits for their turn.
    for (const other of players.filter((p) => p !== player && p !== pia)) {
      const panel = other.page.getByRole("region", { name: "Your pick" });
      await expect(panel.getByTestId("circuit-pick-reason")).toHaveText(
        `Waiting for ${seat.username} to pick.`
      );
      await expect(
        panel
          .getByRole("group", { name: "Choose a contender" })
          .getByRole("textbox", { name: "Category" })
      ).toBeEnabled();
    }

    const waitsOut = player === theo || (player === emmy && !emmyMissed);
    const title = waitsOut ? null : handPicks.shift()!;
    // Cut Pia's connection while someone else drafts by hand.
    const dropPia = !reconnectChecked && title !== null && player !== pia;
    if (dropPia) {
      await pias.drop();
      await expect(pia.page.getByTestId("draft-connection-indicator")).toContainText(
        "Reconnecting"
      );
    }
    if (title) await draftThroughPicker(player.page, "Best Picture", title);
    if (player === emmy && waitsOut) emmyMissed = true;

    await expect
      .poll(async () => (await snapshot()).draft.current_pick_number, {
        timeout: (PICK_CLOCK_SECONDS + 15) * 1000
      })
      .not.toBe(clock.pick_number);

    if (dropPia) {
      // Back online: the draft history catches up without a reload.
      pias.restore();
      await expect(pia.page.getByTestId("draft-connection-indicator")).toBeHidden({
        timeout: 20_000
      });
      await expect(
        pia.page
          .getByRole("region", { name: "Draft history" })
          // Anchor on the picker: a queued pick elsewhere can share the title.
          .getByRole("group", {
            name: `Best Picture: ${title}, drafted by ${player.name}`,
            exact: true
          })
      ).toBeVisible();
      expect(
        await pia.page.evaluate(
          () => (window as unknown as { roomMarker?: string }).roomMarker
        )
      ).toBe("still here");
      reconnectChecked = true;
    }
  }
  expect(reconnectChecked).toBe(true);

  // Every room shows the finished draft as rosters: Theo's queued picks and
  // Emmy's pick made up in the supplemental round read like any other pick.
  for (const p of players) {
    await expect(
      p.page.getByText("Rosters now change through waivers", { exact: false })
    ).toBeVisible();
    const theoCard = p.page.getByRole("region", { name: new RegExp(`^${theo.name}`) });
    await expect(theoCard.getByRole("group", { name: /^Best Director: / })).toHaveCount(
      2
    );
    const emmyCard = p.page.getByRole("region", { name: new RegExp(`^${emmy.name}`) });
    await expect(emmyCard.getByText("2 of 2")).toBeVisible();
    await expect(emmyCard.getByText(/Missed|Supplemental|From queue/)).toHaveCount(0);
  }
  const final = await snapshot();
  expect(final.picks.filter((pick) => pick.outcome === "MISSED")).toHaveLength(1);
});

test("drafting from the queue by double-click, keyboard, phone card and confirm toast", async ({
  browser
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const [commish, pia] = await Promise.all(
    [DRAFT_PLAYERS[0], DRAFT_PLAYERS[1]].map((name) => signIn(browser, name))
  );
  const players = [commish, pia];

  // Two players, two rounds, a long clock and no auto-draft: every pick is by hand.
  const leagueName = `Gesture League ${suffix}`;
  const { league } = await api<{ league: { id: number } }>(commish, "POST", "/leagues", {
    name: leagueName
  });
  const { season } = await api<{ season: { id: number } }>(
    commish,
    "POST",
    `/leagues/${league.id}/seasons`,
    { ceremony_id: Number(process.env.E2E_CEREMONY_ID), pick_timer_seconds: null }
  );
  await api(commish, "POST", `/seasons/${season.id}/members`, { username: pia.name });
  const created = await api<{ circuit_league: { id: number } }>(
    commish,
    "POST",
    `/leagues/${league.id}/circuits`,
    {
      circuit_id: draftCircuit.circuitId,
      settings: { roster_size: 2, pick_timer_seconds: 600, auto_draft_enabled: false }
    }
  );
  const seasonId = created.circuit_league.id;
  await api(pia, "POST", `/circuit-leagues/${seasonId}/join`);
  const queued = new Map<Player, string[]>([
    [commish, ["Film A", "Film B"]],
    [pia, ["Film C", "Film D"]]
  ]);
  for (const [player, titles] of queued) {
    for (const title of titles) {
      await api(player, "POST", `/circuit-leagues/${seasonId}/queue`, {
        selection_id: contender("Best Picture", title).selectionId
      });
    }
  }
  await api(commish, "POST", `/circuit-leagues/${seasonId}/initialize`);

  const slug = leagueName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  for (const p of players) {
    await p.page.goto(`/leagues/${league.id}/${slug}/seasons/full/${seasonId}/draft`);
    await expect(p.page.getByRole("heading", { name: "Draft lobby" })).toBeAttached();
  }
  await commish.page.getByRole("button", { name: "Start draft" }).click();
  await commish.page
    .getByRole("dialog", { name: "Start the draft?" })
    .getByRole("button", { name: "Start draft" })
    .click();
  for (const p of players) {
    await expect(p.page.getByRole("heading", { name: "Draft room" })).toBeAttached();
  }

  const snapshot = () =>
    api<Snapshot>(commish, "GET", `/circuit-leagues/${seasonId}/draft`);
  const byName = new Map(players.map((p) => [p.name, p]));
  const onTheClock = async () => {
    const snap = await snapshot();
    const seat = snap.seats.find(
      (s) => s.seat_number === snap.on_the_clock!.seat_number
    )!;
    return {
      player: byName.get(seat.username)!,
      pickNumber: snap.on_the_clock!.pick_number
    };
  };
  const pickLands = (pickNumber: number) =>
    expect
      .poll(async () => (await snapshot()).draft.current_pick_number)
      .not.toBe(pickNumber);
  const queuePill = (player: Player, title: string) =>
    player.page
      .getByRole("list", { name: "Your queue" })
      .getByRole("button", { name: `Best Picture: ${title}`, exact: true });

  // Pick 1: on the clock, a mouse drag reorders the queue and never arms;
  // then a double-click on the queue's new first contender drafts it.
  const first = await onTheClock();
  const [dragged, other] = queued.get(first.player)!;
  await expect(first.player.page.getByTestId("circuit-staging-note")).toHaveText(
    "You're on the clock. Double-click a contender to draft it, or select it and confirm."
  );
  const firstQueue = () =>
    api<{ items: Array<{ selection: { id: number } }> }>(
      first.player,
      "GET",
      `/circuit-leagues/${seasonId}/queue`
    ).then((q) => q.items.map((i) => i.selection.id));
  await mouseDrag(
    first.player.page,
    queuePill(first.player, dragged!),
    queuePill(first.player, other!)
  );
  await expect
    .poll(firstQueue)
    .toEqual([
      contender("Best Picture", other!).selectionId,
      contender("Best Picture", dragged!).selectionId
    ]);
  for (const title of [dragged!, other!]) {
    await expect(queuePill(first.player, title)).toHaveAttribute("aria-pressed", "false");
  }
  await expect(first.player.page.getByText("Confirm draft pick")).toHaveCount(0);
  const firstTitles = [other!, dragged!];
  await queuePill(first.player, firstTitles[0]!).dblclick();
  await pickLands(first.pickNumber);

  // Pick 2 (the snake turns, so the other player): Enter arms, Shift+Enter drafts.
  const second = await onTheClock();
  expect(second.player).not.toBe(first.player);
  const secondTitles = queued.get(second.player)!;
  await expect(second.player.page.getByTestId("circuit-staging-note")).toHaveText(
    /^You're on the clock\./
  );
  const keyed = queuePill(second.player, secondTitles[0]!);
  await keyed.focus();
  await second.player.page.keyboard.press("Enter");
  await expect(keyed).toHaveAttribute("aria-pressed", "true");
  await second.player.page.keyboard.press("Shift+Enter");
  await pickLands(second.pickNumber);

  // Pick 3 (the same player again), on a phone: tap the pill, then Draft in the card.
  const third = await onTheClock();
  expect(third.player).toBe(second.player);
  const phone = third.player.page;
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.getByRole("button", { name: "Staging" }).click();
  await expect(phone.getByTestId("circuit-staging-note")).toHaveText(
    "You're on the clock. Tap a contender, then Draft."
  );
  await queuePill(third.player, secondTitles[1]!).click();
  const card = phone.getByRole("dialog", { name: "Nominee details" });
  await card.getByRole("button", { name: "Draft", exact: true }).click();
  await pickLands(third.pickNumber);

  // Pick 4: a click arms the contender and the confirm toast drafts it.
  const fourth = await onTheClock();
  expect(fourth.player).toBe(first.player);
  const armed = queuePill(fourth.player, firstTitles[1]!);
  await armed.click();
  await expect(armed).toHaveAttribute("aria-pressed", "true");
  await fourth.player.page.getByText("Confirm draft pick").click();

  await expect.poll(async () => (await snapshot()).draft.status).toBe("COMPLETED");
  const final = await snapshot();
  expect(final.picks.map((pick) => pick.outcome)).toEqual([
    "PICKED",
    "PICKED",
    "PICKED",
    "PICKED"
  ]);
  for (const p of players) {
    await expect(
      p.page.getByText("Rosters now change through waivers", { exact: false })
    ).toBeVisible();
  }
});

test("Add/drop goes to free agency outside a window, to claims inside one, and waits while claims run", async ({
  browser
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const [commish, pia] = await Promise.all(
    [DRAFT_PLAYERS[0], DRAFT_PLAYERS[1]].map((name) => signIn(browser, name))
  );
  const byName = new Map([commish, pia].map((p) => [p.name, p]));

  // Two players with one pick each: the draft is over after two picks.
  const leagueName = `Add Drop League ${suffix}`;
  const { league } = await api<{ league: { id: number } }>(commish, "POST", "/leagues", {
    name: leagueName
  });
  const { season } = await api<{ season: { id: number } }>(
    commish,
    "POST",
    `/leagues/${league.id}/seasons`,
    { ceremony_id: Number(process.env.E2E_CEREMONY_ID), pick_timer_seconds: null }
  );
  await api(commish, "POST", `/seasons/${season.id}/members`, { username: pia.name });
  const created = await api<{ circuit_league: { id: number } }>(
    commish,
    "POST",
    `/leagues/${league.id}/circuits`,
    {
      circuit_id: draftCircuit.circuitId,
      settings: { roster_size: 1, pick_timer_seconds: 600, auto_draft_enabled: false }
    }
  );
  const seasonId = created.circuit_league.id;
  await api(pia, "POST", `/circuit-leagues/${seasonId}/join`);
  await api(commish, "POST", `/circuit-leagues/${seasonId}/initialize`);
  await api(commish, "POST", `/circuit-leagues/${seasonId}/draft`);
  for (const title of ["Film A", "Film B"]) {
    const snap = await api<Snapshot & { draft: { id: number } }>(
      commish,
      "GET",
      `/circuit-leagues/${seasonId}/draft`
    );
    const seat = snap.seats.find((s) => s.seat_number === snap.on_the_clock?.seat_number);
    const player = byName.get(seat?.username ?? "");
    expect(player, "player on the clock").toBeDefined();
    await api(player!, "POST", `/circuit-drafts/${snap.draft.id}/picks`, {
      selection_id: contender("Best Picture", title).selectionId,
      request_id: `${suffix}-${title}`
    });
  }

  const slug = leagueName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const seasonPath = `/leagues/${league.id}/${slug}/seasons/full/${seasonId}`;
  const { page } = commish;
  await serveFilmSearch(page);

  // Free agency is open: Add/drop leads the header and opens "Add a free agent".
  await page.goto(seasonPath);
  const addDrop = page.getByRole("link", { name: "Add/drop" });
  await expect(addDrop).toHaveAttribute("href", `${seasonPath}/roster#add`);
  await expect(
    page.getByRole("main").locator("header").getByRole("link").first()
  ).toHaveText("Add/drop");
  await addDrop.click();
  await expect(page).toHaveURL(new RegExp(`${seasonPath}/roster#add$`));
  await expect(page.getByRole("heading", { name: "Add a free agent" })).toBeFocused();

  // The roster is full, so the drop select asks for a drop; the add icon adds with it.
  const ownTitle = (
    await api<{ entries: Array<{ selection: { film: { title: string } } }> }>(
      commish,
      "GET",
      `/circuit-leagues/${seasonId}/roster`
    )
  ).entries[0]!.selection.film.title;
  const drop = page.getByRole("textbox", { name: "Drop to make room" });
  await expect(drop).toHaveAttribute("placeholder", "Select a pick to drop");
  await drop.click();
  await page.getByRole("option", { name: ownTitle }).click();
  await page.getByRole("textbox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Best Picture", exact: true }).click();
  await page.getByRole("textbox", { name: "Search films" }).fill("Film E");
  await page
    .getByRole("list", { name: "Films" })
    .getByRole("button", { name: "Film E" })
    .click();
  const add = page.getByRole("button", { name: "Add Best Picture: Film E" });
  await add.hover();
  await expect(page.getByRole("tooltip")).toHaveText(`Add, dropping ${ownTitle}`);
  await add.focus();
  await page.keyboard.press("Enter");
  const picks = page.getByRole("region", { name: "Picks" });
  await expect(picks.getByRole("group", { name: /^Best Picture: Film E/ })).toBeVisible();
  await expect(
    picks.getByRole("group", { name: new RegExp(`: ${ownTitle}`) })
  ).toHaveCount(0);

  // A contender someone holds is muted, and its add icon only says who has it.
  const piaTitle = ownTitle === "Film A" ? "Film B" : "Film A";
  await page.getByRole("textbox", { name: "Search films" }).fill(piaTitle);
  await page
    .getByRole("list", { name: "Films" })
    .getByRole("button", { name: piaTitle })
    .click();
  await expect(page.getByText(`Owned by ${pia.name}`)).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Add Best Picture: ${piaTitle}` })
  ).toHaveAttribute("aria-disabled", "true");

  // Inside a window whose claims can change, Add/drop opens "Claim a contender".
  const window = {
    starts_on: "2035-02-08",
    ends_on: "2035-02-12",
    resolves_on: "2035-02-13",
    scoring_days: ["2035-02-08"]
  };
  let locked = false;
  await page.route(
    `${E2E_API_ORIGIN}/circuit-leagues/${seasonId}/roster`,
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        response,
        json: { ...body, free_agency: { open: false, window } }
      });
    }
  );
  await page.route(
    `${E2E_API_ORIGIN}/circuit-leagues/${seasonId}/claims`,
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        response,
        json: {
          ...body,
          window: {
            starts_on: window.starts_on,
            ends_on: window.ends_on,
            resolves_on: window.resolves_on
          },
          locked
        }
      });
    }
  );
  await page.goto(seasonPath);
  await expect(page.getByRole("link", { name: "Add/drop" })).toHaveAttribute(
    "href",
    `${seasonPath}/waivers#claim`
  );
  await expect(
    page.getByText("Claims are being processed.", { exact: false })
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Add/drop" }).click();
  await expect(page).toHaveURL(new RegExp(`${seasonPath}/waivers#claim$`));
  await expect(page.getByRole("heading", { name: "Claim a contender" })).toBeFocused();

  // Once the window's claims are locked, Add/drop leads to the waivers page and says why.
  locked = true;
  await page.goto(seasonPath);
  const processing = page.getByRole("link", { name: "Add/drop" });
  await expect(processing).toHaveAttribute("href", `${seasonPath}/waivers`);
  const caption = page.getByRole("status").filter({
    hasText: "Claims are being processed. Add/drop reopens once they have run."
  });
  await expect(caption).toBeVisible();
  await expect(processing).toHaveAttribute(
    "aria-describedby",
    (await caption.getAttribute("id"))!
  );
  await processing.click();
  await expect(page).toHaveURL(new RegExp(`${seasonPath}/waivers$`));
});

test("claims reorder by dragging a row, by Alt+Arrow on the claim pill, and say so", async ({
  browser
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const [commish, pia] = await Promise.all(
    [DRAFT_PLAYERS[0], DRAFT_PLAYERS[1]].map((name) => signIn(browser, name))
  );
  const byName = new Map([commish, pia].map((p) => [p.name, p]));

  // An in-season league: two players, one pick each.
  const leagueName = `Claims League ${suffix}`;
  const { league } = await api<{ league: { id: number } }>(commish, "POST", "/leagues", {
    name: leagueName
  });
  const { season } = await api<{ season: { id: number } }>(
    commish,
    "POST",
    `/leagues/${league.id}/seasons`,
    { ceremony_id: Number(process.env.E2E_CEREMONY_ID), pick_timer_seconds: null }
  );
  await api(commish, "POST", `/seasons/${season.id}/members`, { username: pia.name });
  const created = await api<{ circuit_league: { id: number } }>(
    commish,
    "POST",
    `/leagues/${league.id}/circuits`,
    {
      circuit_id: draftCircuit.circuitId,
      settings: { roster_size: 1, pick_timer_seconds: 600, auto_draft_enabled: false }
    }
  );
  const seasonId = created.circuit_league.id;
  await api(pia, "POST", `/circuit-leagues/${seasonId}/join`);
  await api(commish, "POST", `/circuit-leagues/${seasonId}/initialize`);
  await api(commish, "POST", `/circuit-leagues/${seasonId}/draft`);
  for (const title of ["Film A", "Film B"]) {
    const snap = await api<Snapshot & { draft: { id: number } }>(
      commish,
      "GET",
      `/circuit-leagues/${seasonId}/draft`
    );
    const seat = snap.seats.find((s) => s.seat_number === snap.on_the_clock?.seat_number);
    const player = byName.get(seat?.username ?? "");
    expect(player, "player on the clock").toBeDefined();
    await api(player!, "POST", `/circuit-drafts/${snap.draft.id}/picks`, {
      selection_id: contender("Best Picture", title).selectionId,
      request_id: `${suffix}-${title}`
    });
  }

  // The stack has no open waiver window, so the claims read is served with
  // two pending claims (for the two drafted contenders), and a reorder
  // answers with the new ranks.
  const { transactions } = await api<{
    transactions: Array<{ add: { id: number; film: { title: string } } | null }>;
  }>(commish, "GET", `/circuit-leagues/${seasonId}/transactions`);
  const selections = transactions
    .map((t) => t.add!)
    .sort((a, b) => a.film.title.localeCompare(b.film.title));
  const at = new Date().toISOString();
  let claims = selections.map((selection, i) => ({
    id: 9001 + i,
    rank: i + 1,
    status: "PENDING",
    failure_reason: null,
    selection,
    drop: null,
    chip: null,
    created_at: at,
    updated_at: at
  }));
  const reorders: number[][] = [];
  const window = {
    starts_on: "2035-02-08",
    ends_on: "2035-02-12",
    resolves_on: "2035-02-13"
  };
  const { page } = commish;
  await page.route(
    `${E2E_API_ORIGIN}/circuit-leagues/${seasonId}/claims`,
    async (route) => {
      const method = route.request().method();
      if (method === "PUT") {
        const ids = (route.request().postDataJSON() as { claim_ids: number[] }).claim_ids;
        reorders.push(ids);
        claims = ids.map((id, i) => ({
          ...claims.find((c) => c.id === id)!,
          rank: i + 1
        }));
      } else if (method !== "GET") {
        return route.fallback();
      }
      return route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": E2E_WEB_ORIGIN,
          "access-control-allow-credentials": "true"
        },
        json: { window, locked: false, claims, chips: [] }
      });
    }
  );

  const slug = leagueName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await page.goto(`/leagues/${league.id}/${slug}/seasons/full/${seasonId}/waivers`);
  const list = page.getByRole("list", { name: "Your claims" });
  const claimPill = (title: string) =>
    list.getByRole("button", { name: `Claim: Best Picture: ${title}`, exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("button", { name: /^Reorder / })).toHaveCount(0);
  await expect(page.getByText(/Drag a claim to change its rank\.$/)).toBeVisible();
  const rows = () => list.getByRole("listitem").allTextContents();
  const announced = (text: string) =>
    expect(page.getByRole("status").filter({ hasText: text })).toBeAttached();

  // Drag the first claim's row by its pill below the second.
  await mouseDrag(page, claimPill("Film A"), claimPill("Film B"));
  await expect.poll(() => reorders.at(-1)).toEqual([9002, 9001]);
  await announced("Moved claim for Film A to rank 2 of 2.");
  await expect.poll(async () => (await rows())[0]).toContain("Film B");
  // The drop did not open the claim's edit modal.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Alt+ArrowUp on the claim pill moves it back, and focus stays on it.
  await claimPill("Film A").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => reorders.at(-1)).toEqual([9001, 9002]);
  await announced("Moved claim for Film A to rank 1 of 2.");
  await expect(claimPill("Film A")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
