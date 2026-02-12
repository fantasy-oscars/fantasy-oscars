import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@ui": path.resolve(__dirname, "src/ui"),
      "@theme": path.resolve(__dirname, "src/theme"),
      "@layout": path.resolve(__dirname, "src/layout")
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/vitest.setup.ts"]
  }
});
