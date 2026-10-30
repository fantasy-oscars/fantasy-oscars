import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin, type ResolvedConfig } from "vite";
import { BRAND_DEFINITIONS, DEFAULT_BRAND, generateBrandCss } from "../src/theme/brands";
import {
  collectFontFaces,
  faceFilePath,
  fontFaceCss,
  preloadFace,
  WEB_ROOT
} from "./fonts";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_URL = "/brand-init.js";
const CSS_ID = "virtual:fo-brand.css";
const RESOLVED_CSS_ID = `\0${CSS_ID}`;
const FONTS_ID = "virtual:fo-fonts.css";
// A real-looking path (the file does not exist) so relative url() targets in the
// generated stylesheet resolve from apps/web/src/theme and Vite hashes the files.
const RESOLVED_FONTS_ID = path.join(WEB_ROOT, "src/theme/brand-fonts.generated.css");
/** Key used for brands without a definition of their own, which render the default. */
export const DEFAULT_PRELOAD_KEY = "*";

/** Preload urls (display, then body) per brand id, plus `*` for the default brand. */
export type FontPreloadMap = Record<string, string[]>;

/** Bundles src/brand-init.ts into one dependency-free classic script. */
export async function buildBrandInitScript(
  preloads: FontPreloadMap = {}
): Promise<string> {
  const result = await build({
    root: webRoot,
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    define: { __FO_FONT_PRELOADS__: JSON.stringify(preloads) },
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
  let config: ResolvedConfig;
  let devScript: Promise<string> | null = null;
  return {
    name: "fo-brand",
    configResolved(resolved) {
      config = resolved;
    },
    resolveId(id) {
      if (id === CSS_ID) return RESOLVED_CSS_ID;
      if (id === FONTS_ID) return RESOLVED_FONTS_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_CSS_ID)
        return generateBrandCss(BRAND_DEFINITIONS, DEFAULT_BRAND);
      if (id === RESOLVED_FONTS_ID) {
        const dir = path.dirname(RESOLVED_FONTS_ID);
        return fontFaceCss(collectFontFaces(BRAND_DEFINITIONS), (b) =>
          path.relative(dir, faceFilePath(b)).split(path.sep).join("/")
        );
      }
      return null;
    },
    transformIndexHtml() {
      return [{ tag: "script", attrs: { src: SCRIPT_URL }, injectTo: "head-prepend" }];
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split("?")[0] !== SCRIPT_URL) return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(await (devScript ??= buildBrandInitScript()));
      });
    },
    async generateBundle(_options, bundle) {
      const urlByFile = new Map<string, string>();
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type === "asset" && fileName.endsWith(".woff2")) {
          for (const original of item.originalFileNames)
            urlByFile.set(path.basename(original), `${config.base}${fileName}`);
        }
      }
      const urlFor = (ref: Parameters<typeof preloadFace>[0]) => {
        const name = path.basename(preloadFace(ref).file);
        const url = urlByFile.get(name);
        if (!url) throw new Error(`Preload font ${name} was not emitted by the build`);
        return url;
      };
      const preloads: FontPreloadMap = {};
      for (const brand of BRAND_DEFINITIONS) {
        preloads[brand.id] = [
          urlFor(brand.fonts.preload.display),
          urlFor(brand.fonts.preload.body)
        ];
      }
      preloads[DEFAULT_PRELOAD_KEY] = preloads[DEFAULT_BRAND.id] ?? [];
      this.emitFile({
        type: "asset",
        fileName: "brand-init.js",
        source: await buildBrandInitScript(preloads)
      });
    }
  };
}
