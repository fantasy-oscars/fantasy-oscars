import { defineConfig } from "@playwright/test";

const webPort = Number(process.env.E2E_WEB_PORT ?? 4173);

/**
 * The player tour: one long journey through a season that screenshots every screen
 * a player sees (`pnpm run tour`). Not part of CI; see tests/tour/README.md.
 */
export default defineConfig({
  testDir: "tests/tour",
  globalSetup: "./tests/tour/global-setup.ts",
  timeout: 30 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    browserName: "chromium",
    trace: "retain-on-failure"
  }
});
