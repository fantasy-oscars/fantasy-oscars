import type { Page } from "@playwright/test";
import type { BrandDefinition, TextCase } from "../../../apps/web/src/theme/brands";
import { GEOMETRY_FLOOR, probeStressBrand } from "../fixtures/probeStressTheme";

// Geometry limits: the screen sweep only proves layouts for themes whose geometry slots
// stay inside the probe-stress theme's. These checks hold every theme to that, slot by
// slot, and hold the text-size slots above the floor the size bucket is judged at.

const WIDEN =
  "widen probeStressBrand in tests/visual/fixtures/probeStressTheme.ts (the sweep then re-runs every screen at the new limit); do not skip this check";
const LOWER =
  "lower GEOMETRY_FLOOR in tests/visual/fixtures/probeStressTheme.ts (the sweep then re-judges every text size); do not skip this check";

/** A length in px; `em` at 16 px, `normal` and unitless 0 as 0. */
function px(value: string): number {
  const v = value.trim();
  if (v === "normal" || v === "0") return 0;
  const m = /^(-?[\d.]+)(px|em)$/.exec(v);
  if (!m) throw new Error(`unsupported length ${value}`);
  return Number(m[1]) * (m[2] === "em" ? 16 : 1);
}

/** Uppercase sets the widest line of a given text; lowercase the narrowest. */
const CASE_RANK: Record<TextCase, number> = {
  lowercase: 0,
  none: 1,
  capitalize: 2,
  uppercase: 3
};

type Ordered = {
  slot: string;
  get: (b: BrandDefinition) => number;
  show: (b: BrandDefinition) => string;
};

const length = (slot: string, get: (b: BrandDefinition) => string): Ordered => ({
  slot,
  get: (b) => px(get(b)),
  show: get
});
const number = (slot: string, get: (b: BrandDefinition) => number | string): Ordered => ({
  slot,
  get: (b) => Number(get(b)),
  show: (b) => String(get(b))
});
const textCase = (slot: string, get: (b: BrandDefinition) => TextCase): Ordered => ({
  slot,
  get: (b) => CASE_RANK[get(b)],
  show: get
});
const flag = (slot: string, get: (b: BrandDefinition) => boolean): Ordered => ({
  slot,
  get: (b) => (get(b) ? 1 : 0),
  show: (b) => (get(b) ? "on" : "off")
});

/** Slots whose larger values take more room; none may exceed the probe-stress theme's. */
export const UPPER_LIMITS: readonly Ordered[] = [
  length("type.h1Size", (b) => b.type.h1Size),
  length("type.h2Size", (b) => b.type.h2Size),
  length("type.h3Size", (b) => b.type.h3Size),
  length("type.bodySize", (b) => b.type.bodySize),
  length("navigation.size", (b) => b.navigation.size),
  length("home.heroMax", (b) => b.home.heroMax),
  number("home.heroFit", (b) => b.home.heroFit),
  length("type.labelLetterSpacing", (b) => b.type.labelLetterSpacing),
  length("type.displayTracking", (b) => b.type.displayTracking),
  length("type.heroTracking", (b) => b.type.heroTracking),
  length("type.displayWordSpacing", (b) => b.type.displayWordSpacing),
  length("wordmark.letterSpacing", (b) => b.wordmark.letterSpacing),
  textCase("type.labelCase", (b) => b.type.labelCase),
  textCase("type.displayCase", (b) => b.type.displayCase),
  textCase("wordmark.case", (b) => b.wordmark.case),
  textCase("navigation.case", (b) => b.navigation.case),
  length("shape.borderWidth", (b) => b.shape.borderWidth),
  length("shape.radiusSm", (b) => b.shape.radiusSm),
  length("shape.radiusMd", (b) => b.shape.radiusMd),
  length("shape.radiusLg", (b) => b.shape.radiusLg),
  flag("shape.ruleStyle double", (b) => b.shape.ruleStyle === "double"),
  flag("decorations.doubleRules", (b) => b.decorations.doubleRules),
  flag("decorations.offsetShadow", (b) => b.decorations.offsetShadow),
  flag("decorations.frameBorders", (b) => b.decorations.frameBorders),
  flag("decorations.greasePencil", (b) => b.decorations.greasePencil),
  number("room.edge.ring", (b) => b.room.edge.ring),
  number("room.edge.drop", (b) => b.room.edge.drop)
];

/** Text size and weight slots, held at or above GEOMETRY_FLOOR. */
const LOWER_LIMITS: ReadonlyArray<[Ordered, number]> = [
  [length("type.h1Size", (b) => b.type.h1Size), px(GEOMETRY_FLOOR.h1Size)],
  [length("type.h2Size", (b) => b.type.h2Size), px(GEOMETRY_FLOOR.h2Size)],
  [length("type.h3Size", (b) => b.type.h3Size), px(GEOMETRY_FLOOR.h3Size)],
  [length("type.bodySize", (b) => b.type.bodySize), px(GEOMETRY_FLOOR.bodySize)],
  [length("navigation.size", (b) => b.navigation.size), px(GEOMETRY_FLOOR.navSize)],
  [length("home.heroMax", (b) => b.home.heroMax), px(GEOMETRY_FLOOR.heroMax)],
  [number("home.heroFit", (b) => b.home.heroFit), GEOMETRY_FLOOR.heroFit],
  [
    number("type.displayWeight", (b) => b.type.displayWeight),
    Number(GEOMETRY_FLOOR.displayWeight)
  ],
  [
    number("wordmark.weight", (b) => b.wordmark.weight),
    Number(GEOMETRY_FLOOR.wordmarkWeight)
  ]
];

/** Problems with a theme's slot values, one line each, naming the slot. */
export function slotLimitProblems(brand: BrandDefinition): string[] {
  const problems: string[] = [];
  for (const limit of UPPER_LIMITS) {
    if (limit.get(brand) > limit.get(probeStressBrand) + 1e-9) {
      problems.push(
        `${limit.slot} is ${limit.show(brand)}, beyond the probe-stress theme's ${limit.show(probeStressBrand)}: ${WIDEN}`
      );
    }
  }
  for (const [limit, floor] of LOWER_LIMITS) {
    if (limit.get(brand) < floor - 1e-9) {
      problems.push(
        `${limit.slot} is ${limit.show(brand)}, below the geometry floor ${floor}: ${LOWER}`
      );
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------
// Font widths.

/** Mixed case, capitals and figures, so neither a wide lowercase nor wide capitals hide. */
export const REFERENCE_TEXT = "Saint Marguerite of the Docks, DRAFT HISTORY 1999";

type FontSlot = {
  slot: string;
  family: string;
  weight: number;
  style: "normal" | "italic";
  textCase: TextCase;
  /** Letter- and word-spacing the slot's text is set with, in em. */
  tracking: number;
  wordSpacing: number;
};

const em = (value: string) => px(value) / 16;

const familyOf = (stack: string) =>
  stack
    .split(",")[0]!
    .trim()
    .replace(/^["']|["']$/g, "");

/**
 * Every font slot at the weights the app sets it in (display titles and the wordmark at
 * the theme's own weight, other text at regular and bold), with the case and spacing the
 * theme sets it in, so the width compared is the width the slot renders.
 */
export function fontSlots(b: BrandDefinition): FontSlot[] {
  const both = (slot: string, stack: string, textCase: TextCase = "none", tracking = 0) =>
    [400, 700].map((weight) => ({
      slot: `${slot} (${weight})`,
      family: familyOf(stack),
      weight,
      style: "normal" as const,
      textCase,
      tracking,
      wordSpacing: 0
    }));
  const navTracking =
    b.navigation.case === "uppercase" ? em(b.type.labelLetterSpacing) : 0;
  return [
    {
      slot: "type.displayFont",
      family: familyOf(b.type.displayFont),
      weight: Number(b.type.displayWeight),
      style: "normal",
      textCase: b.type.displayCase,
      tracking: em(b.type.displayTracking),
      wordSpacing: em(b.type.displayWordSpacing)
    },
    {
      slot: "wordmark.font",
      family: familyOf(b.wordmark.font),
      weight: Number(b.wordmark.weight),
      style: "normal",
      textCase: b.wordmark.case,
      tracking: em(b.wordmark.letterSpacing),
      wordSpacing: 0
    },
    {
      slot: "type.accentFont",
      family: familyOf(b.type.accentFont),
      weight: 400,
      style: b.type.accentStyle,
      textCase: "none",
      tracking: 0,
      wordSpacing: 0
    },
    ...both("type.bodyFont", b.type.bodyFont),
    ...both(
      "type.labelFont",
      b.type.labelFont,
      b.type.labelCase,
      em(b.type.labelLetterSpacing)
    ),
    ...both("type.numeralFont", b.type.numeralFont),
    ...both("navigation.font", b.navigation.font, b.navigation.case, navTracking),
    ...both("room.workFont", b.room.workFont)
  ];
}

function applyCase(text: string, textCase: TextCase) {
  if (textCase === "uppercase") return text.toUpperCase();
  if (textCase === "lowercase") return text.toLowerCase();
  if (textCase === "capitalize") return text.replace(/\b\w/g, (c) => c.toUpperCase());
  return text;
}

export type FontWidth = FontSlot & { width: number; isTheFamily: boolean };

/** Width of the reference text at 100 px, kerning on, as each slot sets it. Runs in the page. */
export async function measureFontSlots(
  page: Page,
  slots: readonly FontSlot[]
): Promise<FontWidth[]> {
  const items = slots.map((s) => ({ ...s, text: applyCase(REFERENCE_TEXT, s.textCase) }));
  const widths = await page.evaluate(async (list) => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("no 2d canvas");
    const out = [];
    for (const item of list) {
      const spec = `${item.style} ${item.weight} 100px "${item.family}"`;
      await document.fonts.load(spec, item.text);
      await document.fonts.ready;
      const measure = (css: string) => {
        ctx.font = css;
        ctx.fontKerning = "normal";
        ctx.letterSpacing = `${item.tracking * 100}px`;
        ctx.wordSpacing = `${item.wordSpacing * 100}px`;
        return ctx.measureText(item.text).width;
      };
      out.push({
        width: measure(spec),
        // A missing family is drawn in the fallback, which differs between serif and monospace.
        isTheFamily: measure(`${spec}, serif`) === measure(`${spec}, monospace`)
      });
    }
    return out;
  }, items);
  return slots.map((s, i) => ({ ...s, ...widths[i]! }));
}

/** Theme slots wider than the probe-stress theme's same slot, or not loaded. */
export function fontWidthProblems(
  theme: readonly FontWidth[],
  stress: readonly FontWidth[]
): string[] {
  const problems: string[] = [];
  for (const row of [...theme, ...stress]) {
    if (!row.isTheFamily)
      problems.push(
        `${row.slot}: ${row.family} did not load, so a fallback was measured`
      );
  }
  for (const row of theme) {
    const limit = stress.find((s) => s.slot === row.slot);
    if (!limit) throw new Error(`the probe-stress theme has no ${row.slot}`);
    if (row.width > limit.width + 0.5) {
      problems.push(
        `${row.slot}: ${row.family} ${row.weight}${row.style === "italic" ? " italic" : ""} sets the reference text ${row.width.toFixed(1)} px wide (case and spacing applied), wider than the probe-stress theme's ${limit.family} ${limit.weight} at ${limit.width.toFixed(1)} px: ${WIDEN}`
      );
    }
  }
  return [...new Set(problems)];
}
