// Pure generator: brand definitions in, one stylesheet out. Output depends only
// on the inputs (stable order, no timestamps), so it is safe to snapshot.
import {
  COLOR_SLOTS,
  DECORATIONS,
  MODES,
  SHADOW_SLOTS,
  type BrandDefinition,
  type Mode
} from "./contract";
import { sharedByMode, sharedConstants } from "./shared";

type Declarations = Array<[name: string, value: string]>;

const LIGHT = '[data-mantine-color-scheme="light"]';
// Dark is the unscoped default, as before brands (Mantine's :root values were dark).
const DARK = `:not(${LIGHT})`;

export function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** `r, g, b` channels of `#rgb`, `#rrggbb` or `rgba(r, g, b, a)`. */
export function colorChannels(value: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return `${n(0)}, ${n(2)}, ${n(4)}`;
  }
  const rgb =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(
      value
    );
  if (rgb) return `${rgb[1]}, ${rgb[2]}, ${rgb[3]}`;
  throw new Error(`Unsupported colour value: ${value}`);
}

function buttonRadius(shape: BrandDefinition["shape"]["buttonShape"]): string {
  if (shape === "pill") return "var(--fo-radius-pill)";
  if (shape === "rounded") return "var(--brand-radius-sm)";
  return "0";
}

function modeDeclarations(
  brand: BrandDefinition,
  mode: Mode,
  prefix: string
): Declarations {
  const out: Declarations = [];
  const { colors, shadows } = brand.modes[mode];
  for (const slot of COLOR_SLOTS) {
    out.push([`${prefix}${kebab(slot)}`, colors[slot]]);
    out.push([`${prefix}${kebab(slot)}-rgb`, colorChannels(colors[slot])]);
  }
  for (const slot of SHADOW_SLOTS) {
    out.push([`${prefix}shadow-${slot}`, shadows[slot]]);
  }
  return out;
}

function commonDeclarations(brand: BrandDefinition): Declarations {
  const { type, wordmark, shape, navigation } = brand;
  const out: Declarations = [
    ["--brand-font-display", type.displayFont],
    ["--brand-font-body", type.bodyFont],
    ["--brand-font-numeral", type.numeralFont],
    ["--brand-font-label", type.labelFont],
    ["--brand-label-case", type.labelCase],
    ["--brand-label-letter-spacing", type.labelLetterSpacing],
    ["--brand-h1-size", type.h1Size],
    ["--brand-h2-size", type.h2Size],
    ["--brand-h3-size", type.h3Size],
    ["--brand-body-size", type.bodySize],
    ["--brand-wordmark-font", wordmark.font],
    ["--brand-wordmark-weight", wordmark.weight],
    ["--brand-wordmark-case", wordmark.case],
    ["--brand-wordmark-letter-spacing", wordmark.letterSpacing],
    ["--brand-wordmark-two-tone", wordmark.twoTone],
    ["--brand-radius-sm", shape.radiusSm],
    ["--brand-radius-md", shape.radiusMd],
    ["--brand-radius-lg", shape.radiusLg],
    ["--brand-button-shape", shape.buttonShape],
    ["--brand-button-radius", buttonRadius(shape.buttonShape)],
    ["--brand-border-width", shape.borderWidth],
    ["--brand-rule-style", shape.ruleStyle],
    ["--brand-nav-active", navigation.activeTab],
    ["--brand-nav-font", navigation.font],
    ["--brand-nav-case", navigation.case],
    ["--brand-nav-size", navigation.size]
  ];
  for (const d of DECORATIONS) {
    out.push([`--brand-deco-${kebab(d)}`, brand.decorations[d] ? "1" : "0"]);
  }
  out.push(["--brand-home-layout", brand.homeLayout]);
  // Both modes are always addressable by name, for tokens that mean "the dark
  // page" regardless of the active mode.
  for (const mode of MODES) {
    out.push(...modeDeclarations(brand, mode, `--brand-${mode}-`));
  }
  return out;
}

function block(selector: string, decls: Declarations): string {
  const body = decls.map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `${selector} {\n${body}\n}`;
}

function brandBlocks(
  brand: BrandDefinition,
  scope: string,
  extra: { common?: Declarations; dark?: Declarations; light?: Declarations } = {}
): string[] {
  return [
    block(scope, [...(extra.common ?? []), ...commonDeclarations(brand)]),
    block(`${scope}${DARK}`, [
      ...modeDeclarations(brand, "dark", "--brand-"),
      ...(extra.dark ?? [])
    ]),
    block(`${scope}${LIGHT}`, [
      ...modeDeclarations(brand, "light", "--brand-"),
      ...(extra.light ?? [])
    ])
  ];
}

/**
 * Stylesheet for all brands. The unscoped `:root` blocks carry `fallback`'s
 * values, so the first paint (before `data-brand` is set) and any unknown brand
 * render the fallback.
 */
export function generateBrandCss(
  brands: readonly BrandDefinition[],
  fallback: BrandDefinition
): string {
  const shared = {
    common: Object.entries(sharedConstants) as Declarations,
    dark: Object.entries(sharedByMode.dark) as Declarations,
    light: Object.entries(sharedByMode.light) as Declarations
  };
  const parts = [
    "/* Generated from src/theme/brands. Do not edit. */",
    ...brandBlocks(fallback, ":root", shared)
  ];
  for (const brand of brands) {
    parts.push(...brandBlocks(brand, `:root[data-brand="${brand.id}"]`));
  }
  return `${parts.join("\n\n")}\n`;
}
