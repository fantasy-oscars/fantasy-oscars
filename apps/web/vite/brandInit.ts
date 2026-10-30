import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "vite";
import { BRAND_DEFINITIONS, DEFAULT_BRAND, generateBrandCss } from "../src/theme/brands";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_URL = "/brand-init.js";
const CSS_ID = "virtual:fo-brand.css";
const RESOLVED_CSS_ID = `\0${CSS_ID}`;

/** Bundles src/brand-init.ts into one dependency-free classic script. */
export async function buildBrandInitScript(): Promise<string> {
  const result = await build({
    root: webRoot,
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: true,
      target: "es2019",
      lib: {
        entry: path.join(webRoot, "src/brand-init.ts"),
        formats: ["iife"],
        name: "foBrandInit",
        fileName: () => "brand-init.js"
      }
    }
  });
  const outputs = Array.isArray(result) ? result : [result];
  const first = outputs[0];
  if (!first || !("output" in first))
    throw new Error("brand-init build produced no output");
  const chunk = first.output.find((o) => o.type === "chunk");
  if (!chunk || chunk.type !== "chunk")
    throw new Error("brand-init build produced no chunk");
  return chunk.code;
}

/**
 * - `virtual:fo-brand.css`: the generated brand stylesheet.
 * - `/brand-init.js`: the pre-paint script, a same-origin classic script so the
 *   `script-src 'self'` CSP needs no change. Injected first in <head>.
 */
export function brandPlugin(): Plugin {
  let script: Promise<string> | null = null;
  const getScript = () => (script ??= buildBrandInitScript());
  return {
    name: "fo-brand",
    resolveId(id) {
      return id === CSS_ID ? RESOLVED_CSS_ID : null;
    },
    load(id) {
      return id === RESOLVED_CSS_ID
        ? generateBrandCss(BRAND_DEFINITIONS, DEFAULT_BRAND)
        : null;
    },
    transformIndexHtml() {
      return [{ tag: "script", attrs: { src: SCRIPT_URL }, injectTo: "head-prepend" }];
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split("?")[0] !== SCRIPT_URL) return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(await getScript());
      });
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "brand-init.js",
        source: await getScript()
      });
    }
  };
}
