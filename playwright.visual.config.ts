import { defineConfig } from "@playwright/test";

// The visual suite owns its ports so it can run next to the e2e suite.
process.env.E2E_WEB_PORT ??= "4273";
process.env.E2E_API_PORT ??= "4274";

const webBaseUrl = `http://127.0.0.1:${process.env.E2E_WEB_PORT}`;
const browserWs = process.env.VISUAL_BROWSER_WS;

if (!browserWs && !process.env.VISUAL_ALLOW_HOST_BROWSER) {
  throw new Error(
    "Run the visual suite through `pnpm run test:visual` (or test:visual:update). " +
      "Baselines are only valid when Chromium runs in the pinned Playwright Docker image; " +
      "see docs/standards/testing.md."
  );
}

export default defineConfig({
  testDir: "tests/visual",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./tests/visual/global-setup.ts",
  // {arg} is the path passed to toHaveScreenshot (screen/mode-viewport.png).
  snapshotPathTemplate: "tests/visual/__screenshots__/{arg}{ext}",
  outputDir: "test-results/visual",
  // Chromium runs emulated (linux/amd64) on Apple silicon, so leave generous headroom.
  timeout: 120_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixels: 0,
      threshold: 0,
      stylePath: "./tests/visual/support/freeze.css"
    }
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: Number(process.env.VISUAL_WORKERS ?? 2),
  reporter: process.env.CI
    ? [
        ["github"],
        ["list"],
        ["html", { outputFolder: "playwright-report/visual", open: "never" }]
      ]
    : [["list"], ["html", { outputFolder: "playwright-report/visual", open: "never" }]],
  use: {
    baseURL: webBaseUrl,
    ...(browserWs
      ? { connectOptions: { wsEndpoint: browserWs, exposeNetwork: "<loopback>" } }
      : {}),
    locale: "en-US",
    timezoneId: "UTC",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    serviceWorkers: "block"
  },
  projects: [{ name: "visual" }]
});
