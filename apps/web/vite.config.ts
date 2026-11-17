import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";
import { brandPlugin } from "./vite/brandInit";
import { markdownTreePlugin } from "./vite/markdownTree";

const AVATAR_DIR = "/src/assets/openmoji/animals/";

// Modules from node_modules that the entry reaches through static imports go to one
// long-cached vendor chunk (React, React Router, Mantine, Floating UI, TanStack Query and
// what they import). The set is closed under imports, so the chunk never imports app code
// and its hash only changes when a dependency does. Libraries only a lazy route needs
// (the markdown parser in the admin preview, for one) stay in that route's chunk.
function vendorChunks() {
  let eager: Set<string> | null = null;
  return (
    id: string,
    meta: {
      getModuleIds: () => IterableIterator<string>;
      getModuleInfo: (id: string) => {
        isEntry: boolean;
        importedIds: readonly string[];
      } | null;
    }
  ): string | undefined => {
    if (!id.includes("/node_modules/")) return undefined;
    if (!eager) {
      const reached = new Set<string>();
      const queue: string[] = [];
      for (const moduleId of meta.getModuleIds()) {
        if (meta.getModuleInfo(moduleId)?.isEntry) queue.push(moduleId);
      }
      while (queue.length > 0) {
        const next = queue.pop() as string;
        if (reached.has(next)) continue;
        reached.add(next);
        queue.push(...(meta.getModuleInfo(next)?.importedIds ?? []));
      }
      eager = reached;
    }
    return eager.has(id) ? "vendor" : undefined;
  };
}

export default defineConfig({
  plugins: [react(), brandPlugin(), markdownTreePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@ui": path.resolve(__dirname, "src/ui"),
      "@theme": path.resolve(__dirname, "src/theme"),
      "@layout": path.resolve(__dirname, "src/app/layouts")
    }
  },
  build: {
    // Small files are inlined as data URIs by default. Avatars stay files, so a page
    // fetches only the animals it shows instead of all of them riding in the entry.
    assetsInlineLimit: (file) => (file.includes(AVATAR_DIR) ? false : undefined),
    rollupOptions: {
      output: { manualChunks: vendorChunks() }
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
