import { test, expect, type Page } from "@playwright/test";
import { adminLogin, CEREMONY_NAME } from "./support/seed";
import { E2E_API_ORIGIN } from "./support/stack";

const PASSWORD = "secret123";

async function adminPost<T>(path: string, body: Record<string, unknown>, token: string) {
  const res = await fetch(`${E2E_API_ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  expect(res.ok, `${path} -> ${res.status}`).toBe(true);
  return (await res.json()) as T;
}

/** An open awards season, so Create season offers both kinds. */
async function openAwardsSeason(name: string, code: string) {
  const token = await adminLogin();
  const created = await adminPost<{ circuit: { id: number } }>(
    "/admin/circuits",
    { code, name },
    token
  );
  await adminPost(`/admin/circuits/${created.circuit.id}/activate`, {}, token);
}

async function registerAndSignIn(page: Page, username: string) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`${username}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: username })).toBeVisible();
}

test("a commissioner creates a full awards season and a single ceremony with the defaults", async ({
  page
}) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const seasonName = `Awards Season ${suffix}`;
  await openAwardsSeason(seasonName, `awards-${suffix}`);
  await registerAndSignIn(page, `commish-${suffix}`);
  await page.goto("/leagues/new");
  await page.getByLabel("Name").fill(`League ${suffix}`);
  await page.getByRole("button", { name: "Create league" }).click();
  const leagueHeading = page.getByRole("heading", { name: `League ${suffix}` });
  await expect(leagueHeading).toBeVisible();
  const leagueUrl = page.url();

  // Both kinds are open, and neither is chosen for the commissioner.
  await page.getByRole("link", { name: "Create season" }).click();
  const full = page.getByRole("radio", { name: "Full awards season" });
  const single = page.getByRole("radio", { name: "Single ceremony" });
  await expect(full).toBeEnabled();
  await expect(full).not.toBeChecked();
  await expect(single).not.toBeChecked();

  // Full awards season with the defaults: one submit.
  // The choice lives in the URL, so the radio checks once the route updates.
  await full.click();
  await expect(full).toBeChecked();
  await expect(page).toHaveURL(/[?&]kind=full/);
  const awardsSeason = page.getByRole("textbox", { name: "Awards season" });
  // Other open awards seasons may exist; pick this one by name.
  if (await awardsSeason.count()) {
    await awardsSeason.click();
    await page.getByRole("option", { name: seasonName, exact: true }).click();
  }
  await expect(page.getByText("Snake draft, 90 seconds per pick.")).toBeVisible();

  // Leaving a modal with changes asks first, on top of the modal, and can be answered.
  await page.getByRole("button", { name: "Edit roster" }).click();
  const roster = page.getByRole("dialog", { name: "Roster" });
  await roster.getByLabel("Roster size").fill("12");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("dialog", { name: "Discard changes?" });
  await expect(discard).toBeVisible();
  // A plain click fails if anything paints over the confirm.
  await discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(discard).toBeHidden();
  await expect(roster).toBeVisible();
  await expect(roster.locator(":focus")).toHaveCount(1);
  await roster.getByRole("button", { name: "Cancel" }).click();
  await discard.getByRole("button", { name: "Discard" }).click();
  await expect(roster).toBeHidden();
  await expect(page.getByText("16 contenders per player.")).toBeVisible();

  await page.getByRole("button", { name: "Create season" }).click();
  await expect(page.getByRole("heading", { level: 2, name: seasonName })).toBeVisible();
  await expect(page).toHaveURL(/\/seasons\/full\/\d+$/);
  expect(page.url().toLowerCase()).not.toContain("circuit");
  await expect(page.getByText("16 contenders per player.")).toBeVisible();

  // Single ceremony with the defaults.
  await page.goto(leagueUrl);
  await page.getByRole("link", { name: "Create season" }).click();
  await single.click();
  await expect(single).toBeChecked();
  await page.getByRole("textbox", { name: "Ceremony" }).click();
  await page.getByRole("option", { name: CEREMONY_NAME }).click();
  await page.getByRole("button", { name: "Create season" }).click();
  await expect(page.getByRole("heading", { name: CEREMONY_NAME })).toBeVisible();

  // The league lists both, in one list, each with its kind.
  await page.goto(leagueUrl);
  await expect(leagueHeading).toBeVisible();
  await expect(page.getByText("Full awards season · 1 member")).toBeVisible();
  await expect(page.getByText("Single ceremony", { exact: true })).toBeVisible();
});
