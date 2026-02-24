import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@ui": path.resolve(__dirname, "src/ui"),
      "@theme": path.resolve(__dirname, "src/theme"),
      "@layout": path.resolve(__dirname, "src/app/layouts")
    }
  },
  server: {
    port: 5173
  }
});
