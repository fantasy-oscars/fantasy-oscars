import { defineConfig } from "vitest/config";
import path from "node:path";
import { markdownTreePlugin } from "./vite/markdownTree";

export default defineConfig({
  plugins: [markdownTreePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@ui": path.resolve(__dirname, "src/ui"),
      "@theme": path.resolve(__dirname, "src/theme"),
      "@layout": path.resolve(__dirname, "src/app/layouts")
    }
  },
  test: {
    environment: "jsdom",
    // jsdom-heavy files take 30-55 s when the cores are contended; the default 5 s fails them.
    testTimeout: 15_000,
    // The workspaces run in parallel; half the cores each keeps the machine from oversubscribing.
    maxWorkers: "50%",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/vitest.setup.ts"]
  }
});
