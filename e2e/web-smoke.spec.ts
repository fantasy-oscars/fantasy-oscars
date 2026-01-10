import { test, expect } from "@playwright/test";

test("web app loads", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /event setup and draft room/i })
  ).toBeVisible();
});

