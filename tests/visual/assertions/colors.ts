import { readFileSync } from "node:fs";
import {
  generateBrandCss,
  type BrandDefinition,
  type Mode
} from "../../../apps/web/src/theme/brands";
import { foTokens } from "../../../apps/web/src/theme/tokens";

// Colour arithmetic for the contrast rule, in Node: CSS colour values in, WCAG ratios out.
// Compositing and luminance follow axe-core's color-contrast rule (channel rounding after
// each flatten, 0.04045 linearisation, white under everything), so a ratio here matches
// the one axe would report for the same colours.

/** Channels 0-255 (not rounded), alpha 0-1. */
export type Rgba = { r: number; g: number; b: number; a: number };

/** Custom property name to its declared value, for one theme in one mode. */
export type Declarations = ReadonlyMap<string, string>;

export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

const KEYWORDS: Record<string, Rgba> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: WHITE
};

/** Splits on commas (or another separator) outside parentheses. */
function splitTop(text: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/** The argument list of `name(...)` when `text` is exactly that call. */
function callArgs(text: string, name: string): string | null {
  if (!text.startsWith(`${name}(`) || !text.endsWith(")")) return null;
  return text.slice(name.length + 1, -1);
}

const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

/** sRGB (0-255) to OKLab. */
export function toOklab({ r, g, b }: Rgba): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map((c) => srgbToLinear(c / 255)) as [
    number,
    number,
    number
  ];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}

/** OKLab to sRGB (0-255), clipped to the gamut. */
export function fromOklab([L, A, B]: readonly number[], a = 1): Rgba {
  const l = (L! + 0.3963377774 * A! + 0.2158037573 * B!) ** 3;
  const m = (L! - 0.1055613458 * A! - 0.0638541728 * B!) ** 3;
  const s = (L! - 0.0894841775 * A! - 1.291485548 * B!) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  const [r, g, b] = lin.map((c) => Math.min(255, Math.max(0, linearToSrgb(c) * 255)));
  return { r: r!, g: g!, b: b!, a };
}

const num = (text: string) => {
  const t = text.trim();
  return t.endsWith("%") ? Number(t.slice(0, -1)) / 100 : Number(t);
};

/**
 * Parses a colour as Chromium serialises a computed value (`rgb()`, `rgba()`,
 * `color(srgb ...)`, `oklab()`), plus `#hex` and the keywords the app uses. Null when the
 * text is not one of those.
 */
export function parseColor(input: string): Rgba | null {
  const text = input.trim().toLowerCase();
  if (text in KEYWORDS) return { ...KEYWORDS[text]! };
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    const at = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return { r: at(0), g: at(2), b: at(4), a: full.length === 8 ? at(6) / 255 : 1 };
  }
  const rgb = callArgs(text, "rgba") ?? callArgs(text, "rgb");
  if (rgb !== null) {
    const [main, slash] = rgb.split("/");
    const parts = (main!.includes(",") ? main!.split(",") : main!.trim().split(/\s+/))
      .map((p) => p.trim())
      .filter(Boolean);
    if (slash !== undefined) parts.push(slash.trim());
    if (parts.length < 3 || parts.length > 4) return null;
    const [r, g, b] = parts
      .slice(0, 3)
      .map((p) => (p.endsWith("%") ? num(p) * 255 : num(p)));
    const a = parts[3] === undefined ? 1 : num(parts[3]);
    const out = { r: r!, g: g!, b: b!, a };
    return Object.values(out).some(Number.isNaN) ? null : out;
  }
  const color = callArgs(text, "color");
  if (color !== null) {
    const [main, slash] = color.split("/");
    const [space, ...channels] = main!.trim().split(/\s+/);
    if (space !== "srgb" || channels.length !== 3) return null;
    const [r, g, b] = channels.map((c) => num(c) * 255);
    return { r: r!, g: g!, b: b!, a: slash === undefined ? 1 : num(slash) };
  }
  const oklab = callArgs(text, "oklab");
  if (oklab !== null) {
    const [main, slash] = oklab.split("/");
    const channels = main!.trim().split(/\s+/).map(num);
    if (channels.length !== 3) return null;
    return fromOklab(channels, slash === undefined ? 1 : num(slash));
  }
  return null;
}

/** `color-mix()` per CSS Color 5: premultiplied interpolation, percentages normalised. */
function colorMix(args: string, resolve: (text: string) => Rgba | null): Rgba | null {
  const [method, first, second] = splitTop(args);
  const space = /^in\s+(srgb|oklab)$/.exec(method ?? "")?.[1];
  if (!space || !first || !second) return null;
  const component = (text: string) => {
    const m = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(text)!;
    return {
      color: resolve(m[1]!.trim()),
      pct: m[2] === undefined ? null : Number(m[2])
    };
  };
  const one = component(first);
  const two = component(second);
  if (!one.color || !two.color) return null;
  let p1 = one.pct ?? (two.pct === null ? 50 : 100 - two.pct);
  let p2 = two.pct ?? 100 - p1;
  const sum = p1 + p2;
  if (sum <= 0) return null;
  const alphaScale = sum < 100 ? sum / 100 : 1;
  p1 /= sum;
  p2 /= sum;
  const a = one.color.a * p1 + two.color.a * p2;
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const coords = (c: Rgba) => (space === "srgb" ? [c.r, c.g, c.b] : toOklab(c));
  const x = coords(one.color);
  const y = coords(two.color);
  const mixed = x.map((v, i) => (v * one.color!.a * p1 + y[i]! * two.color!.a * p2) / a);
  const out =
    space === "srgb"
      ? { r: mixed[0]!, g: mixed[1]!, b: mixed[2]!, a }
      : fromOklab(mixed, a);
  return { ...out, a: out.a * alphaScale };
}

/** Thrown when a value refers to a custom property no declaration defines. */
export class UnresolvedToken extends Error {}

/** Replaces every `var(--name)` (and `var(--name, fallback)`) with its declared value. */
export function substitute(text: string, decls: Declarations, depth = 0): string {
  if (depth > 20) throw new Error(`custom property cycle in ${text}`);
  const at = text.indexOf("var(");
  if (at < 0) return text;
  let depthParen = 0;
  let end = at + 4;
  for (; end < text.length; end++) {
    if (text[end] === "(") depthParen++;
    else if (text[end] === ")") {
      if (depthParen === 0) break;
      depthParen--;
    }
  }
  const [name, fallback] = splitTop(text.slice(at + 4, end));
  const declared = decls.get(name!) ?? fallback;
  if (declared === undefined) throw new UnresolvedToken(`${name} is not declared`);
  const value = substitute(declared, decls, depth + 1);
  return substitute(text.slice(0, at) + value + text.slice(end + 1), decls, depth);
}

/**
 * The colour a CSS value resolves to under `decls`, `"inherit"` for the CSS-wide keyword,
 * or null when the value is not a colour (a gradient, a length, a shadow list).
 */
export function resolveColor(
  value: string,
  decls: Declarations
): Rgba | "inherit" | null {
  const text = substitute(value.trim(), decls).trim();
  if (text === "inherit") return "inherit";
  const evaluate = (t: string): Rgba | null => {
    const s = t.trim().toLowerCase();
    const mix = callArgs(s, "color-mix");
    if (mix !== null) return colorMix(mix, evaluate);
    return parseColor(s);
  };
  return evaluate(text);
}

/** axe's flattenColors for the normal blend mode, with its channel rounding. */
export function flatten(source: Rgba, backdrop: Rgba): Rgba {
  const ao = Math.min(1, Math.max(0, source.a + backdrop.a * (1 - source.a)));
  const channel = (s: number, b: number) =>
    source.a * (1 - backdrop.a) * s +
    source.a * backdrop.a * s +
    (1 - source.a) * backdrop.a * b;
  const r = channel(source.r, backdrop.r);
  const g = channel(source.g, backdrop.g);
  const b = channel(source.b, backdrop.b);
  if (ao === 0) return { r, g, b, a: 0 };
  return { r: Math.round(r / ao), g: Math.round(g / ao), b: Math.round(b / ao), a: ao };
}

function luminance({ r, g, b }: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map((c) => srgbToLinear(c / 255)) as [
    number,
    number,
    number
  ];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast of a foreground over an opaque background, flattening its alpha first (axe's getContrast). */
export function contrast(fg: Rgba, bg: Rgba): number {
  const ink = fg.a < 1 ? flatten(fg, bg) : fg;
  const [hi, lo] = [luminance(ink), luminance(bg)].sort((x, y) => y - x) as [
    number,
    number
  ];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------------------
// Theme declarations: what the brand layer (generated CSS and shared tokens) declares for
// one brand in one mode, plus the theme-free layers above it that brand values refer to.

type Block = { selector: string; decls: Array<[string, string]> };

/** Parses the generator's output: flat `selector { --name: value; }` blocks. */
export function parseBlocks(css: string): Block[] {
  const blocks: Block[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selector = m[1]!.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const decls: Array<[string, string]> = [];
    for (const line of m[2]!.split(/;\s*\n/)) {
      const d = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?);?\s*$/.exec(line);
      if (d) decls.push([d[1]!, d[2]!.trim()]);
    }
    blocks.push({ selector, decls });
  }
  return blocks;
}

const LIGHT = '[data-mantine-color-scheme="light"]';

/** The `:root` aliases of styles.css (`--panel` and friends), which a few brand values use. */
function rootAliases(): Array<[string, string]> {
  const css = readFileSync("apps/web/src/styles.css", "utf8");
  return parseBlocks(css)
    .filter((b) => b.selector === ":root")
    .flatMap((b) => b.decls);
}

const APP_LAYER: ReadonlyArray<[string, string]> = [
  ...Object.entries(foTokens),
  ...rootAliases()
];

const layerCache = new WeakMap<
  BrandDefinition,
  Partial<Record<Mode, Array<[string, string]>>>
>();
const declCache = new WeakMap<BrandDefinition, Partial<Record<Mode, Declarations>>>();

/** Brand-layer declarations as `generateBrandCss` emits them for `brand` in `mode`, unscoped. */
export function brandLayer(brand: BrandDefinition, mode: Mode): Array<[string, string]> {
  const cached = layerCache.get(brand)?.[mode];
  if (cached) return cached;
  const blocks = parseBlocks(generateBrandCss([brand], brand));
  const root = blocks.filter(
    (b) => b.selector.startsWith(":root") && !b.selector.includes("data-brand")
  );
  const common = root.find((b) => b.selector === ":root");
  const scoped = root.find((b) =>
    mode === "light"
      ? b.selector === `:root${LIGHT}`
      : b.selector === `:root:not(${LIGHT})`
  );
  if (!common || !scoped) throw new Error("unexpected generated brand CSS shape");
  const out: Array<[string, string]> = [...common.decls, ...scoped.decls];
  layerCache.set(brand, { ...layerCache.get(brand), [mode]: out });
  return out;
}

/** Everything a colour expression from the registry may refer to, for one theme. */
export function themeDeclarations(brand: BrandDefinition, mode: Mode): Declarations {
  const cached = declCache.get(brand)?.[mode];
  if (cached) return cached;
  const out: Declarations = new Map([...APP_LAYER, ...brandLayer(brand, mode)]);
  declCache.set(brand, { ...declCache.get(brand), [mode]: out });
  return out;
}
