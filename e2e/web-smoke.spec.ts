import { test, expect } from "@playwright/test";

test("web app loads", async ({ page }) => {
  await page.goto("/");
  await expect(
    // The app renders an H1 in chrome (brand) and an H1 in the landing hero.
    // Scope to main content so this smoke test doesn't assume a single H1 globally.
    page.getByRole("main").getByRole("heading", { level: 1, name: /Fantasy Oscars/i })
  ).toBeVisible();
});
