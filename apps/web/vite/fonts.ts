import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FONT_CATALOG,
  PRIMARY_SUBSET,
  type BrandDefinition,
  type FontFaceRef,
  type FontFamily,
  type FontStyle,
  type FontSubset
} from "../src/theme/brands";

export const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** One @font-face rule: a single file for one subset of one family. */
export type FontFaceBlock = {
  family: FontFamily;
  style: FontStyle;
  /** Inclusive weight range the file covers (min equals max for static files). */
  minWeight: number;
  maxWeight: number;
  subset: FontSubset;
  pkg: string;
  /** Path of the woff2 file inside its package, such as `files/inter-latin-400-normal.woff2`. */
  file: string;
  format: string;
  unicodeRange: string;
};

const BLOCK_RE = /@font-face\s*{([^}]*)}/g;

function readPackageCss(pkg: string, cssName: string): string {
  return fs.readFileSync(
    path.join(WEB_ROOT, "node_modules", pkg, `${cssName}.css`),
    "utf8"
  );
}

function parseBlocks(family: FontFamily, pkg: string, css: string): FontFaceBlock[] {
  const out: FontFaceBlock[] = [];
  for (const m of css.matchAll(BLOCK_RE)) {
    const body = m[1] ?? "";
    const src = /url\(\.\/(files\/[^)]+\.woff2)\)\s*format\('([^']+)'\)/.exec(body);
    const slug = path.basename(pkg);
    const subset = src
      ? new RegExp(`^files/${slug}-(.+)-(?:\\d+|wght)-(?:normal|italic)\\.woff2$`).exec(
          src[1] ?? ""
        )?.[1]
      : undefined;
    if (!src || !subset) continue;
    const style = /font-style:\s*(\w+)/.exec(body)?.[1] as FontStyle | undefined;
    const weight = /font-weight:\s*(\d+)(?:\s+(\d+))?/.exec(body);
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
    if (!style || !weight || !range) throw new Error(`Unparseable @font-face in ${pkg}`);
    out.push({
      family,
      style,
      minWeight: Number(weight[1]),
      maxWeight: Number(weight[2] ?? weight[1]),
      subset,
      pkg,
      file: src[1] ?? "",
      format: src[2] ?? "woff2",
      unicodeRange: range.trim()
    });
  }
  return out;
}

/** Every subset's face for one family and style (and weight, for static families). */
function facesFor(family: FontFamily, weight: number, style: FontStyle): FontFaceBlock[] {
  const { pkg, kind } = FONT_CATALOG[family];
  const suffix = style === "italic" ? "-italic" : "";
  const cssName = kind === "static" ? `${weight}${suffix}` : `wght${suffix}`;
  const blocks = parseBlocks(family, pkg, readPackageCss(pkg, cssName)).filter(
    (b) => b.style === style
  );
  if (!blocks.some((b) => b.subset === PRIMARY_SUBSET))
    throw new Error(
      `${family} ${weight} ${style} has no ${PRIMARY_SUBSET} face in ${pkg}`
    );
  return blocks;
}

/** Every distinct face needed by the given brands, in a stable order. */
export function collectFontFaces(brands: readonly BrandDefinition[]): FontFaceBlock[] {
  const seen = new Map<string, FontFaceBlock>();
  for (const brand of brands) {
    for (const need of brand.fonts.faces) {
      for (const style of need.styles) {
        for (const weight of need.weights) {
          for (const block of facesFor(need.family, weight, style)) {
            seen.set(`${block.pkg}/${block.file}`, block);
          }
        }
      }
    }
  }
  return [...seen.values()].sort((a, b) =>
    `${a.family}|${a.style}|${a.minWeight}|${a.subset}`.localeCompare(
      `${b.family}|${b.style}|${b.minWeight}|${b.subset}`
    )
  );
}

/** The latin file for a preload reference. */
export function preloadFace(ref: FontFaceRef): FontFaceBlock {
  const block = facesFor(ref.family, ref.weight, ref.style).find(
    (b) => b.subset === PRIMARY_SUBSET
  );
  if (!block) throw new Error(`No latin face for ${ref.family}`);
  return block;
}

/** CSS for the faces. `urlFor` turns a block into the url() target. */
export function fontFaceCss(
  blocks: readonly FontFaceBlock[],
  urlFor: (block: FontFaceBlock) => string
): string {
  return blocks
    .map((b) => {
      const weight =
        b.minWeight === b.maxWeight ? `${b.minWeight}` : `${b.minWeight} ${b.maxWeight}`;
      return `@font-face {
  font-family: "${b.family}";
  font-style: ${b.style};
  font-display: swap;
  font-weight: ${weight};
  src: url(${urlFor(b)}) format("${b.format}");
  unicode-range: ${b.unicodeRange};
}
`;
    })
    .join("\n");
}

/** Absolute path of a face's file inside apps/web/node_modules. */
export function faceFilePath(block: FontFaceBlock): string {
  return path.join(WEB_ROOT, "node_modules", block.pkg, block.file);
}
