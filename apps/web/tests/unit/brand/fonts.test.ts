// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterAll, describe, expect, it } from "vitest";
import { build } from "vite";
import {
  BRAND_DEFINITIONS,
  DEFAULT_BRAND,
  FONT_CATALOG,
  type BrandDefinition,
  type FontFamily,
  type FontStyle
} from "../../../src/theme/brands";
import {
  collectFontFaces,
  faceFilePath,
  fontFaceCss,
  preloadFace,
  WEB_ROOT
} from "../../../vite/fonts";

const ALL_FAMILIES = Object.keys(FONT_CATALOG) as FontFamily[];

/** A stand-in brand that asks for every catalog family at the weights the designs use. */
const everyFamily: BrandDefinition = {
  ...DEFAULT_BRAND,
  fonts: {
    faces: [
      ...ALL_FAMILIES.map((family) => ({
        family,
        weights: [400, 500, 600, 700],
        styles: ["normal"] as FontStyle[]
      })),
      { family: "Playfair Display", weights: [400, 700], styles: ["italic"] },
      { family: "Bodoni Moda", weights: [400, 700], styles: ["italic"] },
      { family: "Archivo", weights: [800, 900], styles: ["normal"] },
      { family: "Fraunces", weights: [900], styles: ["normal"] }
    ],
    preload: DEFAULT_BRAND.fonts.preload
  }
};

function covered(
  brand: BrandDefinition,
  family: FontFamily,
  weight: number,
  style: FontStyle,
  subset: string
): boolean {
  return collectFontFaces([brand]).some(
    (b) =>
      b.family === family &&
      b.style === style &&
      b.subset === subset &&
      b.minWeight <= weight &&
      weight <= b.maxWeight
  );
}

describe("brand fonts", () => {
  it.each([...BRAND_DEFINITIONS, everyFamily].map((b, i) => [i, b] as const))(
    "brand %s has @font-face coverage (latin at minimum) for every declared weight and style",
    (_i, brand) => {
      for (const need of brand.fonts.faces) {
        for (const style of need.styles) {
          for (const weight of need.weights) {
            for (const subset of ["latin"]) {
              expect(
                covered(brand, need.family, weight, style, subset),
                `${need.family} ${weight} ${style} ${subset}`
              ).toBe(true);
            }
          }
        }
      }
    }
  );

  it("every brand's preload faces are among its declared faces", () => {
    for (const brand of BRAND_DEFINITIONS) {
      for (const ref of Object.values(brand.fonts.preload)) {
        const need = brand.fonts.faces.find((n) => n.family === ref.family);
        expect(need?.weights, ref.family).toContain(ref.weight);
        expect(need?.styles, ref.family).toContain(ref.style);
      }
    }
  });

  it("every face file exists and only woff2 is referenced", () => {
    const blocks = collectFontFaces([everyFamily]);
    for (const b of blocks) {
      expect(fs.existsSync(faceFilePath(b)), b.file).toBe(true);
    }
    const css = fontFaceCss(blocks, (b) => b.file);
    expect(css).toContain("font-display: swap");
    expect(css).not.toContain(".woff)");
  });

  it("declares every subset a package ships, so non-Latin names still render", () => {
    const subsets = new Set(collectFontFaces([DEFAULT_BRAND]).map((b) => b.subset));
    for (const s of ["latin", "latin-ext", "cyrillic", "greek", "vietnamese"])
      expect(subsets.has(s), s).toBe(true);
  });

  it("refined-gold loads the same latin files it bundled before", () => {
    const files = collectFontFaces([DEFAULT_BRAND])
      .filter((b) => b.subset === "latin" || b.subset === "latin-ext")
      .map((b) => path.basename(b.file))
      .sort();
    expect(files).toEqual([
      "cinzel-latin-400-normal.woff2",
      "cinzel-latin-700-normal.woff2",
      "cinzel-latin-ext-400-normal.woff2",
      "cinzel-latin-ext-700-normal.woff2",
      "inter-latin-400-normal.woff2",
      "inter-latin-700-normal.woff2",
      "inter-latin-ext-400-normal.woff2",
      "inter-latin-ext-700-normal.woff2"
    ]);
    expect(path.basename(preloadFace(DEFAULT_BRAND.fonts.preload.display).file)).toBe(
      "cinzel-latin-700-normal.woff2"
    );
  });
});

describe("built font preload map", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "fo-fonts-"));
  afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

  it("resolves every brand's preload links to files in the build output", async () => {
    await build({
      root: WEB_ROOT,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true }
    });
    const code = fs.readFileSync(path.join(outDir, "brand-init.js"), "utf8");
    const html = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
    expect(html).toContain("/brand-init.js");

    const assets = path.join(outDir, "assets");
    const css = fs
      .readdirSync(assets)
      .filter((f) => f.endsWith(".css"))
      .map((f) => fs.readFileSync(path.join(assets, f), "utf8"))
      .join("\n");
    const urls = [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => m[1] ?? "");
    expect(urls.length).toBeGreaterThan(8);
    for (const url of urls) {
      expect(fs.existsSync(path.join(outDir, url)), url).toBe(true);
    }

    for (const brand of BRAND_DEFINITIONS) {
      const links: Array<Record<string, string>> = [];
      const documentElement = { dataset: {} as Record<string, string> };
      const sandbox: Record<string, unknown> = {
        document: {
          documentElement,
          head: { appendChild: (l: Record<string, string>) => links.push(l) },
          createElement: () => ({})
        },
        localStorage: {
          getItem: (k: string) => (k === "fo:brand-preference" ? brand.id : null),
          setItem: () => undefined,
          removeItem: () => undefined
        },
        sessionStorage: {
          getItem: () => null,
          setItem: () => undefined,
          removeItem: () => undefined
        }
      };
      sandbox.window = sandbox;
      vm.runInNewContext(code, sandbox);
      expect(documentElement.dataset.brand).toBe(brand.id);
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(link).toMatchObject({
          rel: "preload",
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous"
        });
        expect(fs.existsSync(path.join(outDir, link.href ?? "")), link.href).toBe(true);
      }
    }
  }, 120_000);
});
