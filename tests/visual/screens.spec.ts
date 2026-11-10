import { test, expect } from "@playwright/test";
import { KNOWN_PHONE_OVERFLOW, MAX_PAGE_HEIGHT, VIEWPORTS, allCaptures } from "./matrix";
import {
  freezeClock,
  installNetworkGuards,
  readSeed,
  selectAppearance,
  settle,
  trackInFlight,
  signIn
} from "./support/page";

for (const { brand, mode, viewport: viewportName, screen, snapshot } of allCaptures()) {
  test.describe(`${brand.id} ${mode} ${viewportName}`, () => {
    test.use({
      viewport: VIEWPORTS[viewportName],
      colorScheme: mode
    });

    test(screen.id, async ({ page, context }) => {
      const seed = readSeed();
      const blocked = await installNetworkGuards(context);
      const preferenceWrites = await selectAppearance(
        context,
        brand.slug,
        mode,
        screen.discovered
      );
      if (screen.persona) await signIn(context, seed.tokens[screen.persona]);
      const inFlight = trackInFlight(page);
      await freezeClock(page);

      await screen.beforeNavigate?.(page, seed);
      await page.goto(screen.path(seed));
      const marker =
        "text" in screen.ready
          ? page.getByText(screen.ready.text).first()
          : page.locator(screen.ready.selector).first();
      await expect(marker).toBeVisible();
      await screen.prepare?.(page);
      await settle(page, inFlight);
      expect(blocked, "requests that left the machine").toEqual([]);
      expect(preferenceWrites, "brand preference writes").toEqual([]);

      if (viewportName === "mobile" && !KNOWN_PHONE_OVERFLOW.includes(screen.id)) {
        const scrollWidth = await page.evaluate(
          () => document.documentElement.scrollWidth
        );
        expect(scrollWidth, "horizontal overflow at 390px").toBeLessThanOrEqual(
          VIEWPORTS.mobile.width
        );
      }

      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      const fullPage =
        screen.fullPage === true && height > VIEWPORTS[viewportName].height;
      const mask = (screen.maskSelectors ?? []).map((selector) => page.locator(selector));
      await expect(page).toHaveScreenshot(
        snapshot,
        fullPage
          ? {
              fullPage: true,
              mask,
              clip: {
                x: 0,
                y: 0,
                width: VIEWPORTS[viewportName].width,
                height: Math.min(height, screen.maxHeight ?? MAX_PAGE_HEIGHT)
              }
            }
          : { mask }
      );
    });
  });
}
