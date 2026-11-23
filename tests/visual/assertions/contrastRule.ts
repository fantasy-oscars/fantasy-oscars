import {
  contrast,
  flatten,
  resolveColor,
  themeDeclarations,
  WHITE,
  type Rgba
} from "./colors";
import { pairKey, type Bucket, type Registry, type RegistryEntry } from "./pairs";
import type { Theme } from "./themes";

// The contrast rule: every registry pair, composited from one theme's token values, must
// reach the threshold its bucket sets. Pure Node; no browser.

/**
 * axe passes text only above its threshold (`contrast > expected`); the placeholder and
 * room icon checks pass at the threshold.
 */
const THRESHOLDS: Record<Bucket, { min: number; strict: boolean }> = {
  normal: { min: 4.5, strict: true },
  large: { min: 3, strict: true },
  placeholder: { min: 4.5, strict: false },
  "non-text": { min: 3, strict: false }
};

export type PairOutcome =
  | { status: "pass" | "fail"; ratio: number; threshold: number }
  | { status: "unchecked"; reason: string };

const round = (c: Rgba): Rgba => ({
  r: Math.round(c.r),
  g: Math.round(c.g),
  b: Math.round(c.b),
  a: c.a
});

/** One pair in one theme. Throws when an expression cannot be resolved there. */
export function evaluatePair(pair: RegistryEntry, theme: Theme): PairOutcome {
  const decls = themeDeclarations(theme.definition, theme.mode);
  const colour = (expr: string, what: string): Rgba | "inherit" => {
    const c = resolveColor(expr, decls);
    if (c === null) throw new Error(`${theme.id}: ${what} ${expr} is not a colour`);
    return c;
  };
  const layers = pair.layers.map((expr) =>
    expr === "image" ? ("image" as const) : colour(expr, "layer")
  );
  let start = 0;
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!;
    if (layer === "image") return { status: "unchecked", reason: "background image" };
    if (layer !== "inherit" && layer.a >= 1) {
      start = i;
      break;
    }
  }
  let bg = WHITE;
  for (const layer of layers.slice(start)) {
    if (layer === "image" || layer === "inherit") continue;
    bg = flatten(round(layer), bg);
  }
  let fg = colour(pair.fg, "foreground");
  if (fg === "inherit") {
    if (!pair.inherit)
      throw new Error(
        `${theme.id}: ${pair.fg} inherits but no parent colour was recorded`
      );
    fg = colour(pair.inherit, "inherited foreground");
    if (fg === "inherit")
      throw new Error(`${theme.id}: ${pair.inherit} resolves to inherit`);
  }
  const ratio = contrast(round(fg), bg);
  const { min, strict } = THRESHOLDS[pair.bucket];
  const ok = strict ? ratio > min : ratio >= min;
  return { status: ok ? "pass" : "fail", ratio, threshold: min };
}

export type ContrastFailure = {
  key: string;
  ratio: number;
  threshold: number;
  screen: string;
};

/** Every registry pair seen in the theme's mode, evaluated; failures sorted worst first. */
export function evaluateTheme(registry: Registry, theme: Theme) {
  const failures: ContrastFailure[] = [];
  let checked = 0;
  let unchecked = 0;
  for (const pair of registry.pairs) {
    if (!pair.modes.includes(theme.mode)) continue;
    const outcome = evaluatePair(pair, theme);
    if (outcome.status === "unchecked") {
      unchecked++;
      continue;
    }
    checked++;
    if (outcome.status === "fail") {
      failures.push({
        key: pairKey(pair),
        ratio: outcome.ratio,
        threshold: outcome.threshold,
        screen: pair.screens[0] ?? "?"
      });
    }
  }
  failures.sort((a, b) => a.ratio / a.threshold - b.ratio / b.threshold);
  return { failures, checked, unchecked };
}
