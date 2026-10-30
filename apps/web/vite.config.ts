import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";
import { brandPlugin } from "./vite/brandInit";

export default defineConfig({
  plugins: [react(), brandPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@ui": path.resolve(__dirname, "src/ui"),
      "@theme": path.resolve(__dirname, "src/theme"),
      "@layout": path.resolve(__dirname, "src/app/layouts")
    }
  },
  server: {
    port: 5173,
    // Same-origin mode: set VITE_API_BASE=/api. Mirrors the production proxy,
    // which strips the /api prefix before forwarding to the API.
    proxy: {
      "/api": {
        target: "http://localhost:4010",
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/api/, "")
      }
    }
  }
});
