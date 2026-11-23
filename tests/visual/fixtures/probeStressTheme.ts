// The probe-stress theme: the screen sweep's only theme (docs/adr/0008). Its geometry is
// the stress brand's (stressBrand.ts) raised to the largest value any shipped theme uses
// for every geometry slot, so a layout that holds here holds in every theme whose slots
// stay inside it (geometryLimits.ts enforces that). Its colours are probes: every colour
// custom property of the brand layer gets its own unambiguous value, so a computed colour
// on the page maps back to the property that painted it. Test-only: never registered for
// users, painted over the default brand's page like the stress brand.
import {
  BRAND_DEFINITIONS,
  MODES,
  generateBrandCss,
  type BrandDefinition,
  type Mode
} from "../../../apps/web/src/theme/brands";
import {
  brandLayer,
  parseColor,
  resolveColor,
  themeDeclarations,
  toOklab,
  fromOklab,
  type Rgba,
  UnresolvedToken
} from "../assertions/colors";
import { CINZEL, PLEX } from "../../../apps/web/src/theme/brands/stacks";
import { MONTSERRAT, stressBrand } from "./stressBrand";

/**
 * The stress brand with every geometry slot at the widest value a shipped theme uses.
 * Raise a value here (never lower it below a shipped theme) when a theme outgrows it; the
 * sweep then re-runs every screen at the new limit.
 */
export const probeStressBrand: BrandDefinition = {
  ...stressBrand,
  type: {
    ...stressBrand.type,
    displayFont: CINZEL,
    displayWeight: "700",
    displayCase: "uppercase",
    displayTracking: "0.01em",
    heroTracking: "0.01em",
    displayWordSpacing: "0.12em",
    labelFont: MONTSERRAT,
    labelCase: "uppercase",
    labelLetterSpacing: "0.12em",
    bodyFont: MONTSERRAT,
    // Monospaced figures and lowercase: wider than any shipped numeral face.
    numeralFont: PLEX,
    accentFont: MONTSERRAT,
    h1Size: "40px",
    h2Size: "32px",
    h3Size: "22px",
    bodySize: "14px"
  },
  wordmark: {
    ...stressBrand.wordmark,
    font: CINZEL,
    weight: "900",
    case: "uppercase",
    letterSpacing: "0.02em"
  },
  navigation: {
    ...stressBrand.navigation,
    font: MONTSERRAT,
    case: "uppercase",
    size: "20px"
  },
  decorations: {
    doubleRules: true,
    offsetShadow: true,
    frameBorders: true,
    greasePencil: true
  },
  home: { ...stressBrand.home, heroMax: "148px", heroFit: 24 }
};

/**
 * The smallest text size and weight values a theme may use. A text's size bucket (large
 * text needs 3:1, other text 4.5:1) is recorded as large only when it is large at these
 * values too, so a theme with smaller headings than the probe-stress theme cannot inherit
 * a laxer threshold. Lower a value here when a theme goes below it.
 */
export const GEOMETRY_FLOOR = {
  h1Size: "32px",
  h2Size: "24px",
  h3Size: "17px",
  bodySize: "14px",
  navSize: "12px",
  heroMax: "44px",
  heroFit: 12.5,
  displayWeight: "600",
  wordmarkWeight: "600"
} as const;

/** The floor as overrides of the generated properties, for the size-bucket pass. */
export const FLOOR_CSS = `:root {
  --brand-h1-size: ${GEOMETRY_FLOOR.h1Size} !important;
  --brand-h2-size: ${GEOMETRY_FLOOR.h2Size} !important;
  --brand-h3-size: ${GEOMETRY_FLOOR.h3Size} !important;
  --brand-body-size: ${GEOMETRY_FLOOR.bodySize} !important;
  --brand-nav-size: ${GEOMETRY_FLOOR.navSize} !important;
  --brand-home-hero-max: ${GEOMETRY_FLOOR.heroMax} !important;
  --brand-home-hero-fit: ${GEOMETRY_FLOOR.heroFit} !important;
  --brand-display-weight: ${GEOMETRY_FLOOR.displayWeight} !important;
  --brand-room-title-weight: ${GEOMETRY_FLOOR.displayWeight} !important;
  --brand-wordmark-weight: ${GEOMETRY_FLOOR.wordmarkWeight} !important;
}`;

// ---------------------------------------------------------------------------------------
// Probe colours.

const LIGHT = '[data-mantine-color-scheme="light"]';

function tryResolve(value: string, brand: BrandDefinition, mode: Mode) {
  try {
    return resolveColor(value, themeDeclarations(brand, mode));
  } catch (err) {
    if (err instanceof UnresolvedToken) return null;
    throw err;
  }
}

const ALL_BRANDS = [...BRAND_DEFINITIONS, probeStressBrand];

/** Brand-layer property names, with their probe-stress values per mode. */
const LAYER: Record<Mode, Map<string, string>> = {
  light: new Map(brandLayer(probeStressBrand, "light")),
  dark: new Map(brandLayer(probeStressBrand, "dark"))
};

/** What `name` resolves to in every theme (shipped and probe-stress) and mode. */
function resolutions(name: string) {
  return ALL_BRANDS.flatMap((brand) =>
    MODES.map((mode) => {
      const value = themeDeclarations(brand, mode).get(name);
      return value === undefined ? null : tryResolve(value, brand, mode);
    })
  );
}

/**
 * Colour properties of the brand layer: every generated or shared property (other than
 * `-rgb` channel lists) that resolves to a colour in some theme.
 */
export const COLOR_TOKENS: readonly string[] = [...LAYER.light.keys()]
  .filter((name) => !name.endsWith("-rgb"))
  .filter((name) => resolutions(name).some((r) => r !== null && r !== "inherit"))
  .sort();

/** Colour properties that resolve to `inherit` in some theme: their text takes its parent's colour. */
export const INHERITABLE_TOKENS: ReadonlySet<string> = new Set(
  COLOR_TOKENS.filter((name) => resolutions(name).includes("inherit"))
);

/** Every token's alpha in the probe-stress theme, per mode, so transparency is unchanged by probing. */
const STRESS_ALPHA: Record<Mode, Map<string, number>> = {
  light: new Map(),
  dark: new Map()
};
for (const mode of MODES) {
  for (const name of COLOR_TOKENS) {
    const value = LAYER[mode].get(name);
    const resolved =
      value === undefined ? null : tryResolve(value, probeStressBrand, mode);
    STRESS_ALPHA[mode].set(name, resolved && resolved !== "inherit" ? resolved.a : 1);
  }
}

const GRID = Array.from({ length: 13 }, (_, i) => 12 + i * 20);

/** Probe channels, spaced 20 apart per channel and never grey; palette 1 is a disjoint set. */
function probeChannels(index: number, palette: 0 | 1): [number, number, number] {
  let n = index * 2 + palette;
  for (;;) {
    const c: [number, number, number] = [
      GRID[n % 13]!,
      GRID[Math.floor(n / 13) % 13]!,
      GRID[Math.floor(n / 169) % 13]!
    ];
    if (!(c[0] === c[1] && c[1] === c[2])) return c;
    n += 2 * COLOR_TOKENS.length + 7;
  }
}

const PROBES: Record<0 | 1, Map<string, [number, number, number]>> = {
  0: new Map(COLOR_TOKENS.map((t, i) => [t, probeChannels(i, 0)])),
  1: new Map(COLOR_TOKENS.map((t, i) => [t, probeChannels(i, 1)]))
};

const formatAlpha = (a: number) => String(Math.round(a * 1000) / 1000);

/**
 * The probe-stress theme as CSS: the generated stylesheet for its geometry, then every
 * colour property (and its `-rgb` channel list) replaced by its probe, with the alpha
 * the probe-stress theme gives it in that mode.
 */
export function probeStressCss(palette: 0 | 1 = 0): string {
  const base = generateBrandCss([probeStressBrand], probeStressBrand);
  const block = (mode: Mode) => {
    const lines: string[] = [];
    for (const name of COLOR_TOKENS) {
      const [r, g, b] = PROBES[palette].get(name)!;
      const a = STRESS_ALPHA[mode].get(name)!;
      lines.push(`  ${name}: rgba(${r}, ${g}, ${b}, ${formatAlpha(a)}) !important;`);
      if (LAYER[mode].has(`${name}-rgb`)) {
        lines.push(`  ${name}-rgb: ${r}, ${g}, ${b} !important;`);
      }
    }
    return lines.join("\n");
  };
  return `${base}
:root:not(${LIGHT}) {
${block("dark")}
}
:root${LIGHT} {
${block("light")}
}
`;
}

// ---------------------------------------------------------------------------------------
// Decoding a computed colour back to the expression that painted it.

const CHANNEL_TOLERANCE = 1.01;

function near(c: Rgba, [r, g, b]: readonly number[], tol = CHANNEL_TOLERANCE) {
  return (
    Math.abs(c.r - r!) <= tol && Math.abs(c.g - g!) <= tol && Math.abs(c.b - b!) <= tol
  );
}

const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;

function probeAt(c: Rgba, palette: 0 | 1): string | undefined {
  for (const [name, channels] of PROBES[palette]) if (near(c, channels)) return name;
  return undefined;
}

/** A colour that is one probe, alone or at some alpha. */
function decodeSingle(c: Rgba, mode: Mode, palette: 0 | 1): string | undefined {
  const name = probeAt(c, palette);
  if (!name) return undefined;
  const own = STRESS_ALPHA[mode].get(name)!;
  if (Math.abs(c.a - own) < 0.003) return `var(${name})`;
  if (LAYER[mode].has(`${name}-rgb`))
    return `rgba(var(${name}-rgb), ${formatAlpha(c.a)})`;
  return `color-mix(in srgb, var(${name}) ${pct(own === 0 ? 0 : c.a / own)}, transparent)`;
}

const ANCHORS: Array<[string, Rgba]> = [
  ["black", { r: 0, g: 0, b: 0, a: 1 }],
  ["white", { r: 255, g: 255, b: 255, a: 1 }]
];

/**
 * An opaque colour that is `color-mix()` of two probes in sRGB, or of a probe with black
 * or white in OKLab (the only spaces the app mixes those in).
 */
function decodeMix(c: Rgba, palette: 0 | 1): string | undefined {
  if (c.a < 0.999) return undefined;
  const probes = [...PROBES[palette]].map(
    ([name, [r, g, b]]) => [`var(${name})`, { r, g, b, a: 1 }] as [string, Rgba]
  );
  const target = [c.r, c.g, c.b];
  for (const [nameA, a] of probes) {
    const x = [a.r, a.g, a.b];
    for (const [nameB, b] of probes) {
      if (nameA === nameB) continue;
      const y = [b.r, b.g, b.b];
      // Least-squares weight of A in sRGB.
      let num = 0;
      let den = 0;
      for (let i = 0; i < 3; i++) {
        num += (target[i]! - y[i]!) * (x[i]! - y[i]!);
        den += (x[i]! - y[i]!) ** 2;
      }
      if (den === 0) continue;
      const p = Math.round((num / den) * 100) / 100;
      if (p <= 0 || p >= 1) continue;
      const mixed = x.map((v, i) => v * p + y[i]! * (1 - p));
      if (near(c, mixed, 1.6)) return `color-mix(in srgb, ${nameA} ${pct(p)}, ${nameB})`;
    }
    // OKLab mixes with black or white (the button micro-states).
    const lab = toOklab(a);
    const labC = toOklab(c);
    for (const [nameB, b] of ANCHORS) {
      const labB = toOklab(b);
      const den = lab[0] - labB[0];
      if (Math.abs(den) < 1e-6) continue;
      const p = Math.round(((labC[0] - labB[0]) / den) * 100) / 100;
      if (p <= 0 || p >= 1) continue;
      const mixed = fromOklab(lab.map((v, i) => v * p + labB[i]! * (1 - p)));
      if (near(c, [mixed.r, mixed.g, mixed.b], 1.6))
        return `color-mix(in oklab, ${nameA} ${pct(p)}, ${nameB})`;
    }
  }
  return undefined;
}

export type Decoded =
  | { kind: "token"; expr: string }
  | { kind: "literal"; expr: string }
  | { kind: "transparent" };

/**
 * The expression behind a computed colour: a brand-layer property (alone, at an alpha, or
 * mixed with another), or a literal when no probe is involved. A literal is only trusted
 * once the same element reads the same under the second palette (see the sweep).
 */
export function decodeColor(computed: string, mode: Mode, palette: 0 | 1): Decoded {
  const c = parseColor(computed);
  if (!c) return { kind: "literal", expr: computed };
  const single = decodeSingle(c, mode, palette);
  if (single) return { kind: "token", expr: single };
  if (c.a === 0) return { kind: "transparent" };
  const mix = decodeMix(c, palette);
  if (mix) return { kind: "token", expr: mix };
  const channel = (v: number) => Math.round(v);
  return {
    kind: "literal",
    expr:
      c.a >= 0.999
        ? `rgb(${channel(c.r)}, ${channel(c.g)}, ${channel(c.b)})`
        : `rgba(${channel(c.r)}, ${channel(c.g)}, ${channel(c.b)}, ${formatAlpha(c.a)})`
  };
}

/** The bare property name of a `var(--x)` expression. */
export function tokenOf(expr: string): string | undefined {
  return /^var\((--[\w-]+)\)$/.exec(expr)?.[1];
}
