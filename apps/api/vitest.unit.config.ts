import { mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(baseConfig, {
  test: {
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/integration/**"],
    // The workspaces run in parallel; half the cores each keeps the machine from oversubscribing.
    maxWorkers: "50%"
  }
});
