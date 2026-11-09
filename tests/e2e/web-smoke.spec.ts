import { test, expect } from "@playwright/test";

test("web app loads", async ({ page }) => {
  await page.goto("/");
  // The wordmark in the app chrome is the page's only H1; the landing hero is an H2.
  await expect(
    page.getByRole("heading", { level: 1, name: /Fantasy Oscars/i })
  ).toHaveCount(1);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 2, name: /Fantasy Oscars/i })
  ).toBeVisible();
});
