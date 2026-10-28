import { test, expect, type Browser, type Page } from "@playwright/test";
import { adminLogin, CEREMONY_NAME } from "./support/seed";
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN } from "./support/stack";

const PASSWORD = "secret123";

// Pick order for the six-pick snake draft (seat 1, 2, 2, 1, 1, 2). Winners are
// chosen so that the two seats finish on different scores whichever user holds
// which seat: seat 1 owns picks 1, 4, 5 and seat 2 owns picks 2, 3, 6.
const PICK_ORDER = [
  { category: "Best Picture", nominee: "Film A" },
  { category: "Best Picture", nominee: "Film B" },
  { category: "Best Director", nominee: "Film C" },
  { category: "Best Director", nominee: "Film D" },
  { category: "Best Editing", nominee: "Film E" },
  { category: "Best Editing", nominee: "Film F" }
] as const;
const WINNERS = [
  { categoryEditionId: 1, nominationId: 1, nominee: "Film A" },
  { categoryEditionId: 2, nominationId: 3, nominee: "Film C" },
  { categoryEditionId: 3, nominationId: 5, nominee: "Film E" }
] as const;

async function registerAndSignIn(page: Page, username: string) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`${username}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: username })).toBeVisible();
}

async function newUserPage(browser: Browser, username: string) {
  const context = await browser.newContext({
    baseURL: E2E_WEB_ORIGIN,
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage();
  await registerAndSignIn(page, username);
  return page;
}

async function adminPost(path: string, body: Record<string, unknown>, token: string) {
  const res = await fetch(`${E2E_API_ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  expect(res.ok, `${path} -> ${res.status}`).toBe(true);
}

test("two users run a league from invite to final standings", async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const nameA = `alice-${suffix}`;
  const nameB = `bob-${suffix}`;

  const pageB = await newUserPage(browser, nameB);
  const pageA = await newUserPage(browser, nameA);

  // User A creates a league and a season for the seeded ceremony.
  await pageA.goto("/leagues/new");
  await pageA.getByLabel("Name").fill(`League ${suffix}`);
  await pageA.getByRole("button", { name: "Create league" }).click();
  await expect(pageA.getByRole("heading", { name: `League ${suffix}` })).toBeVisible();
  await pageA.getByRole("link", { name: "Create season" }).click();
  await pageA.getByRole("textbox", { name: "Ceremony" }).click();
  await pageA.getByRole("option", { name: CEREMONY_NAME }).click();
  // Untimed draft.
  await pageA.getByRole("switch", { name: "Pick timer" }).uncheck();
  await pageA.getByRole("button", { name: "Create season" }).click();
  await expect(pageA.getByRole("heading", { name: CEREMONY_NAME })).toBeVisible();

  // User A invites user B by username.
  await pageA.getByRole("button", { name: "Manage participants" }).click();
  const manage = pageA.getByRole("dialog", { name: "Manage participants" });
  await manage.getByLabel("Username").fill(nameB);
  await pageA.getByRole("option", { name: nameB }).click();
  await manage.getByRole("button", { name: "Create invite" }).click();
  await pageA.keyboard.press("Escape");

  // User B accepts from their invites inbox.
  await expect(async () => {
    await pageB.goto("/invites");
    await expect(pageB.getByRole("button", { name: "Accept" })).toBeVisible({
      timeout: 2_000
    });
  }).toPass();
  await pageB.getByRole("button", { name: "Accept" }).click();
  await expect(pageB.getByRole("heading", { name: CEREMONY_NAME })).toBeVisible();

  // Both users are listed as participants, as seen by each of them.
  await pageA.reload();
  for (const page of [pageA, pageB]) {
    const participants = page
      .getByRole("heading", { name: "Participants" })
      .locator("..");
    await expect(participants.getByText(nameA)).toBeVisible();
    await expect(participants.getByText(nameB)).toBeVisible();
  }

  // The commissioner starts the draft; both users enter the draft room.
  const players = [
    { name: nameA, page: pageA },
    { name: nameB, page: pageB }
  ];
  for (const { page } of players) {
    await page.getByRole("link", { name: "Enter draft room" }).click();
  }
  await pageA.getByRole("button", { name: "Start draft" }).click();

  for (const { page } of players) {
    await page.getByRole("button", { name: "Expand draft history" }).click();
  }

  // Users draft in turn: whoever's board is enabled for the target nominee picks it.
  const pickedBy = new Map<string, string>();
  for (const [index, { category, nominee }] of PICK_ORDER.entries()) {
    const label = `${category}: ${nominee}`;
    let picker: (typeof players)[number] | undefined;
    await expect(async () => {
      for (const player of players) {
        const disabled = await player.page
          .getByRole("button", { name: label })
          .getAttribute("aria-disabled");
        if (disabled === "false") picker = player;
      }
      expect(picker).toBeDefined();
    }).toPass();
    await picker!.page.getByRole("button", { name: label }).dblclick();
    pickedBy.set(nominee, picker!.name);
    // The last pick completes the draft, which swaps the ledger for the roster view.
    if (index === PICK_ORDER.length - 1) break;
    for (const { page } of players) {
      await expect(
        page.getByRole("region", { name: "Draft history" }).getByRole("group", {
          name: label
        })
      ).toBeVisible();
    }
  }

  // The draft is complete for both users: every pick is on the roster board.
  for (const { page } of players) {
    for (const { category, nominee } of PICK_ORDER) {
      await expect(
        page.getByRole("group", { name: `${category}: ${nominee}` })
      ).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Pause draft" })).toBeHidden();
  }

  for (const { page } of players) {
    await expect(page.getByLabel("0 winners")).toHaveCount(2);
  }

  // The admin enters winners and finalizes the ceremony.
  const token = await adminLogin();
  for (const winner of WINNERS) {
    await adminPost(
      "/admin/winners",
      {
        category_edition_id: winner.categoryEditionId,
        nomination_id: winner.nominationId
      },
      token
    );
  }
  await adminPost(
    `/admin/ceremonies/${process.env.E2E_CEREMONY_ID}/finalize-winners`,
    {},
    token
  );

  // Standings: each user's score is the number of winners they drafted.
  const scores = new Map(players.map(({ name }) => [name, 0]));
  for (const { nominee } of WINNERS) {
    const owner = pickedBy.get(nominee)!;
    scores.set(owner, scores.get(owner)! + 1);
  }
  expect([...scores.values()].sort()).toEqual([1, 2]);
  const leader = [...scores.entries()].find(([, score]) => score === 2)![0];
  for (const { page } of players) {
    await page.reload();
    for (const [name, score] of scores) {
      await expect(
        page.getByLabel(`${score} winners`).locator("xpath=preceding-sibling::p[1]")
      ).toHaveText(name);
    }
    await expect(
      page.getByText("Winner", { exact: true }).locator("xpath=..")
    ).toContainText(leader);
  }
});
