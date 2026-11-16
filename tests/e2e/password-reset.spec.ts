import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { E2E_API_ORIGIN } from "./support/stack";

const OLD_PASSWORD = "secret123";
const NEW_PASSWORD = "brand-new-secret";

async function register(username: string, email: string) {
  const res = await fetch(`${E2E_API_ORIGIN}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email, password: OLD_PASSWORD })
  });
  expect(res.ok, `register -> ${res.status}`).toBe(true);
}

/**
 * The reset link the logging mailer wrote to the API log for `maskedTo` (the log
 * masks the recipient as `p***@domain`, so each test uses its own domain).
 */
function loggedResetLink(maskedTo: string): string | null {
  const logPath = process.env.E2E_API_LOG;
  if (!logPath) throw new Error("E2E_API_LOG is not set by the e2e global setup");
  let link: string | null = null;
  for (const line of readFileSync(logPath, "utf8").split("\n")) {
    if (!line.startsWith("{")) continue;
    const entry = JSON.parse(line) as { msg?: string; to?: string; link?: string };
    if (entry.msg === "mail_logged" && entry.to === maskedTo && entry.link) {
      link = entry.link;
    }
  }
  return link;
}

async function setNewPassword(page: Page, password: string) {
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password);
  await page.getByRole("button", { name: "Save new password" }).click();
}

test("a player resets a forgotten password by email and signs in with it", async ({
  page
}) => {
  const suffix = Date.now().toString(36);
  const username = `reset-${suffix}`;
  const domain = `reset-${suffix}.example.com`;
  await register(username, `player@${domain}`);

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(`player@${domain}`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText(
      "If an account uses that address, we've sent a link. It expires in an hour."
    )
  ).toBeVisible();

  let link: string | null = null;
  await expect
    .poll(() => (link = loggedResetLink(`p***@${domain}`)), { timeout: 10_000 })
    .toBeTruthy();
  const resetLink = String(link);

  await page.goto(resetLink);
  await expect(page.getByRole("button", { name: "Save new password" })).toBeVisible();
  // The token leaves the address bar as soon as the page has read it.
  await expect(page).toHaveURL(/\/reset-password$/);
  await setNewPassword(page, NEW_PASSWORD);

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("Your password has been changed. Sign in with your new password.")
  ).toBeVisible();

  // The link works once.
  await page.goto(resetLink);
  await setNewPassword(page, "another-secret-1");
  await expect(
    page.getByText("This reset link is invalid or has expired.")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ask for a new link" })).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(OLD_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect username or password.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: username })).toBeVisible();
});
