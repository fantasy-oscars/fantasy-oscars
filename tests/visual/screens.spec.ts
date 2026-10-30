import { test, expect } from "@playwright/test";
import {
  BRANDS,
  MAX_PAGE_HEIGHT,
  MODES,
  SCREENS,
  VIEWPORTS,
  snapshotName,
  type ViewportName
} from "./matrix";
import {
  freezeClock,
  installNetworkGuards,
  readSeed,
  setColorScheme,
  settle,
  trackInFlight,
  signIn
} from "./support/page";

for (const brand of BRANDS) {
  for (const mode of MODES) {
    for (const viewportName of Object.keys(VIEWPORTS) as ViewportName[]) {
      test.describe(`${brand.id} ${mode} ${viewportName}`, () => {
        test.use({
          viewport: VIEWPORTS[viewportName],
          colorScheme: mode
        });

        for (const screen of SCREENS) {
          test(screen.id, async ({ page, context }) => {
            const seed = readSeed();
            const blocked = await installNetworkGuards(context);
            await setColorScheme(context, mode);
            // Brands: select the brand here (as setColorScheme does) once they exist.
            if (screen.persona) await signIn(context, seed.tokens[screen.persona]);
            const inFlight = trackInFlight(page);
            await freezeClock(page);

            await page.goto(screen.path(seed));
            const marker =
              "text" in screen.ready
                ? page.getByText(screen.ready.text).first()
                : page.locator(screen.ready.selector).first();
            await expect(marker).toBeVisible();
            await screen.prepare?.(page);
            await settle(page, inFlight);
            expect(blocked, "requests that left the machine").toEqual([]);

            const height = await page.evaluate(
              () => document.documentElement.scrollHeight
            );
            const fullPage =
              screen.fullPage === true && height > VIEWPORTS[viewportName].height;
            await expect(page).toHaveScreenshot(
              [screen.id, `${snapshotName(brand, mode, viewportName)}.png`],
              fullPage
                ? {
                    fullPage: true,
                    clip: {
                      x: 0,
                      y: 0,
                      width: VIEWPORTS[viewportName].width,
                      height: Math.min(height, MAX_PAGE_HEIGHT)
                    }
                  }
                : {}
            );
          });
        }
      });
    }
  }
}
