import { mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(baseConfig, {
  test: {
    include: [
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.integration.test.ts"
    ],
    exclude: ["tests/unit/**"],
    // Each test file starts its own Postgres container. More than three at once
    // overloads Docker on a developer machine and fails tests on hook timeouts.
    maxWorkers: 3
  }
});
