import {
  test,
  expect,
  type Browser,
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

  // Pia reorders her queue by keyboard during the draft.
  await pia.page.evaluate(() => {
    (window as unknown as { roomMarker: string }).roomMarker = "still here";
  });
  const filmF = contender("Best Director", "Film F").selectionId;
  const filmE = contender("Best Director", "Film E").selectionId;
  const grip = pia.page.getByRole("button", { name: /^Reorder Film E/ });
  await grip.focus();
  await expect(grip).toBeFocused();
  // Each step waits for the screen reader announcement it causes.
  const announced = (text: string | RegExp) =>
    expect(pia.page.getByText(text)).toBeAttached();
  await pia.page.keyboard.press("Space");
  await announced(
    new RegExp(`(Picked up draggable item|moved over droppable area) queue:${filmE}\\b`)
  );
  // dnd-kit listens for the arrow keys from a zero-delay timer after the lift;
  // a timer queued now runs after it, so the next key is not lost.
  await pia.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await pia.page.keyboard.press("ArrowDown");
  await announced(`moved over droppable area queue:${filmF}`);
  await pia.page.keyboard.press("Space");
  await announced(`dropped over droppable area queue:${filmF}`);
  await expect.poll(() => queueOf(pia)).toEqual([filmF, filmE]);

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
          .getByText(`${player.name}: ${title}`, { exact: true })
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

  // Every room shows the finished draft: Theo's picks came from his queue, and
  // Emmy's missed pick was made up in the supplemental round.
  for (const p of players) {
    await expect(
      p.page.getByText("Rosters now change through waivers", { exact: false })
    ).toBeVisible();
    const theoColumn = p.page.getByRole("region", { name: new RegExp(`^${theo.name}`) });
    await expect(theoColumn.getByText(/From queue/)).toHaveCount(2);
    const emmyColumn = p.page.getByRole("region", { name: new RegExp(`^${emmy.name}`) });
    await expect(emmyColumn.getByText("Made up in the supplemental round")).toBeVisible();
    await expect(emmyColumn.getByText(/^Supplemental, for pick \d+/)).toBeVisible();
  }
  const final = await snapshot();
  expect(final.picks.filter((pick) => pick.outcome === "MISSED")).toHaveLength(1);
});
