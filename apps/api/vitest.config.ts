import { defineConfig } from "vitest/config";

const skipContainers =
  process.env.SKIP_CONTAINERS === "1" ||
  (process.env.CI === "true" && !process.env.DOCKER_HOST);

const containerTests = [
  "test/db.integration.test.ts",
  "test/factories/db.test.ts",
  "test/routes/**/*.integration.test.ts",
  "test/scripts/load-nominees.test.ts",
  "test/data/repositories.test.ts",
  "test/migrations.test.ts"
];

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: skipContainers ? containerTests : [],
    globals: true
  }
});
