import type { CellMeasurement, Sample } from "./measure";
import type { UsedFont } from "./fonts";
import {
  ENTRIES,
  RELATIONS,
  type Bound,
  type Check,
  type Entry,
  type FontSlot,
  type Num,
  type NumProp,
  type Relation,
  type State,
  type Viewport
} from "./spec";

/** Where a measurement was taken. `brand` is the matrix id (`default` is refined-gold). */
export type CellScope = { brand: string; mode: string; viewport: Viewport };

/** What failed, in the terms an allowlist entry matches on. */
export type FailureKey = CellScope & {
  hook: string;
  state: string;
  /** A value property, a check kind, `relation` or `axe`. */
  prop: string;
  /** The measured value(s), rounded, as the message prints them: what an allowlist entry pins. */
  value: string;
};

export type Failure = { key: FailureKey; message: string };

export type AxeFinding = { hook: string; state: string; detail: string };

const FONT_SLOT_TOKEN: Record<FontSlot, string> = {
  display: "--brand-font-display",
  body: "--brand-font-body",
  numeral: "--brand-font-numeral",
  label: "--brand-font-label",
  nav: "--brand-nav-font",
  wordmark: "--brand-wordmark-font",
  "room-work": "--brand-room-font-work",
  "room-title": "--brand-room-font-title"
};

const round = (n: number) => Math.round(n * 100) / 100;

function tokenNumber(tokens: Record<string, string>, name: string): number {
  const raw = tokens[name] ?? "";
  // `normal` is how a slot spells zero letter-spacing.
  const n = raw === "normal" ? 0 : parseFloat(raw);
  if (!Number.isFinite(n))
    throw new Error(`spec names ${name}, which the page does not resolve to a number`);
  return n;
}

function resolveNum(num: Num, tokens: Record<string, string>): number {
  if (typeof num === "number") return num;
  return tokenNumber(tokens, num.token) * (num.factor ?? 1) + (num.offset ?? 0);
}

function describeNum(num: Num, tokens: Record<string, string>): string {
  if (typeof num === "number") return String(num);
  const value = round(resolveNum(num, tokens));
  const shifted = num.offset ? `${num.offset > 0 ? "+" : ""}${num.offset}` : "";
  const scaled = num.factor ? `*${num.factor}` : "";
  return `${value} (${num.token}${scaled}${shifted})`;
}

export function derive(prop: NumProp, s: Sample): number | null {
  switch (prop) {
    case "height":
      return s.height;
    case "width":
      return s.width;
    case "touch":
      return Math.min(s.hitWidth, s.hitHeight);
    case "borderWidth":
      return s.borderWidth;
    case "radius":
      return s.radius === "percent" ? null : s.radius;
    case "fontSize":
      return s.fontSize;
    case "lineHeightRatio":
      return (s.lineHeight ?? s.fontSize * 1.2) / s.fontSize;
    case "fontWeight":
      return s.fontWeight;
    case "letterSpacingEm":
      return s.fontSize > 0 ? s.letterSpacing / s.fontSize : 0;
    case "iconSize":
      return s.iconSize;
    case "gap":
      return s.gap;
  }
}

function judgeBound(
  measured: number,
  bound: Bound,
  tokens: Record<string, string>,
  sample: Sample
): { ok: boolean; expected: string } {
  if ("anyOf" in bound) {
    const options = bound.anyOf.map((n) => resolveNum(n, tokens));
    return {
      ok: options.some((o) => Math.abs(o - measured) <= 0.5),
      expected: `one of ${bound.anyOf.map((n) => describeNum(n, tokens)).join(", ")}`
    };
  }
  if ("equals" in bound) {
    let want = resolveNum(bound.equals, tokens);
    let note = describeNum(bound.equals, tokens);
    if (bound.capPx !== undefined) {
      want = Math.min(want, bound.capPx);
      note += ` capped at ${bound.capPx}`;
    }
    if (bound.capHalfHeight) {
      want = Math.min(want, sample.height / 2);
      note += ` capped at half the height (${round(sample.height / 2)})`;
    }
    const tol = bound.tol ?? 0.5;
    return {
      ok: Math.abs(measured - want) <= tol,
      expected: `${note}${tol ? ` ±${tol}` : ""}`
    };
  }
  const min = bound.min === undefined ? -Infinity : resolveNum(bound.min, tokens);
  const max = bound.max === undefined ? Infinity : resolveNum(bound.max, tokens);
  const parts = [
    bound.min === undefined ? null : `>= ${describeNum(bound.min, tokens)}`,
    bound.max === undefined ? null : `<= ${describeNum(bound.max, tokens)}`
  ].filter(Boolean);
  return {
    ok: measured >= min - 0.01 && measured <= max + 0.01,
    expected: parts.join(" and ")
  };
}

function firstFamily(css: string): string {
  return (css.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

type Context = {
  scope: CellScope;
  cell: CellMeasurement;
  fonts: Map<number, UsedFont>;
  failures: Failure[];
  /** Messages already reported for a cell, so a hook with many samples reports once. */
  reported: Set<string>;
};

function fail(
  ctx: Context,
  hook: string,
  state: string,
  prop: string,
  detail: string,
  source: string,
  value = ""
) {
  const label = `${ctx.scope.brand}/${ctx.scope.mode}/${ctx.scope.viewport} · ${hook}:${state} · ${prop}: ${detail}`;
  const message = source ? `${label} (source: ${source})` : label;
  if (ctx.reported.has(message)) return;
  ctx.reported.add(message);
  ctx.failures.push({
    key: { ...ctx.scope, hook, state, prop, value },
    message
  });
}

const inScope = (list: Viewport[] | undefined, viewport: Viewport) =>
  !list || list.includes(viewport);

function judgeCheck(ctx: Context, entry: Entry, check: Check, samples: Sample[]) {
  const { tokens, scale } = ctx.cell;
  const { viewport } = ctx.scope;
  const of = (state: State) => samples.filter((s) => s.state === state);
  const defaultSample = of("default")[0];

  switch (check.kind) {
    case "value": {
      if (!inScope(check.viewports, viewport)) return;
      for (const s of samples) {
        if (check.states && !check.states.includes(s.state as State)) continue;
        const measured = derive(check.prop, s);
        if (measured === null) continue;
        const { ok, expected } = judgeBound(measured, check.bound, tokens, s);
        if (!ok)
          fail(
            ctx,
            entry.hook,
            s.state,
            check.prop,
            `measured ${round(measured)}, expected ${expected}`,
            check.source,
            String(round(measured))
          );
      }
      return;
    }
    case "scale": {
      if (!inScope(check.viewports, viewport)) return;
      for (const s of samples) {
        const off = s.padding.filter((p) => !scale.some((v) => Math.abs(v - p) <= 0.01));
        if (off.length > 0)
          fail(
            ctx,
            entry.hook,
            s.state,
            "padding",
            `measured ${s.padding.map(round).join(" ")}, expected every side in the scale {${scale.join(", ")}} (off: ${off.map(round).join(", ")})`,
            check.source,
            s.padding.map(round).join(" ")
          );
      }
      return;
    }
    case "padding": {
      if (!inScope(check.viewports, viewport)) return;
      const sides = ["top", "right", "bottom", "left"] as const;
      for (const s of samples) {
        const bad: string[] = [];
        sides.forEach((side, i) => {
          const want = check[side];
          if (want === undefined) return;
          const target =
            typeof want === "object" && "ofHeight" in want
              ? s.height * want.ofHeight + (want.offset ?? 0)
              : resolveNum(want, tokens);
          const got = s.padding[i]!;
          if (Math.abs(got - target) > (check.tol ?? 0.5))
            bad.push(`${side} ${round(got)} (expected ${round(target)})`);
        });
        if (bad.length > 0)
          fail(
            ctx,
            entry.hook,
            s.state,
            "padding",
            `measured ${s.padding.map(round).join(" ")}, expected ${bad.join(", ")}`,
            check.source,
            s.padding.map(round).join(" ")
          );
      }
      return;
    }
    case "case": {
      const want = tokens[check.token] ?? "none";
      for (const s of samples) {
        if (s.textTransform !== want)
          fail(
            ctx,
            entry.hook,
            s.state,
            "case",
            `measured ${s.textTransform}, expected ${want} (${check.token})`,
            check.source,
            s.textTransform
          );
      }
      return;
    }
    case "font": {
      const wanted = check.slots.map((slot) => ({
        slot,
        family: firstFamily(tokens[FONT_SLOT_TOKEN[slot]] ?? "")
      }));
      const names = wanted.map((w) => w.family);
      for (const s of samples.slice(0, 1)) {
        const requested = firstFamily(s.fontFamily);
        if (!names.includes(requested))
          fail(
            ctx,
            entry.hook,
            s.state,
            "font",
            `requested "${requested}", expected one of ${wanted.map((w) => `"${w.family}" (${FONT_SLOT_TOKEN[w.slot]})`).join(", ")}`,
            check.source,
            requested
          );
      }
      let usedAt = -1;
      ctx.cell.samples.forEach((s, i) => {
        if (usedAt < 0 && s.hook === entry.hook && ctx.fonts.has(i)) usedAt = i;
      });
      const used = usedAt >= 0 ? ctx.fonts.get(usedAt) : undefined;
      if (used) {
        const ok = used.custom && names.some((n) => used.family.startsWith(n));
        if (!ok)
          fail(
            ctx,
            entry.hook,
            "default",
            "font",
            `painted "${used.family}"${used.custom ? "" : " (a system face)"}, expected the brand face ${names.map((n) => `"${n}"`).join(" or ")} to render, not a fallback`,
            check.source,
            used.family
          );
      }
      return;
    }
    case "textContrast": {
      for (const s of samples) {
        if (s.state === "disabled" || s.textContrast === null) continue;
        const need = s.largeText ? 3 : 4.5;
        if (s.textContrast < need)
          fail(
            ctx,
            entry.hook,
            s.state,
            "textContrast",
            `measured ${round(s.textContrast)}:1, expected >= ${need}:1${s.largeText ? " (large text)" : ""}`,
            "WCAG 1.4.3",
            String(round(s.textContrast))
          );
      }
      return;
    }
    case "iconContrast": {
      for (const s of samples) {
        if (s.state === "disabled" || s.iconContrast === null) continue;
        if (s.iconContrast < 3)
          fail(
            ctx,
            entry.hook,
            s.state,
            "iconContrast",
            `measured ${round(s.iconContrast)}:1, expected >= 3:1`,
            "WCAG 1.4.11 graphical object",
            String(round(s.iconContrast))
          );
      }
      return;
    }
    case "boundary": {
      for (const s of samples) {
        if (s.state === "disabled") continue;
        const best = Math.max(s.boundaryContrast ?? 0, s.fillContrast ?? 0);
        if (best < 3)
          fail(
            ctx,
            entry.hook,
            s.state,
            "boundary",
            `measured border ${round(s.boundaryContrast ?? 0)}:1 and fill ${round(s.fillContrast ?? 0)}:1 against the surface, expected one >= 3:1`,
            check.source,
            `${round(s.boundaryContrast ?? 0)}|${round(s.fillContrast ?? 0)}`
          );
      }
      return;
    }
    case "focusRing": {
      for (const s of of("focus")) {
        const borderChanged =
          defaultSample !== undefined &&
          s.borderWidth > 0 &&
          s.borderColor !== defaultSample.borderColor;
        const ringWidth = s.ring?.width ?? 0;
        const thickness = ringWidth + (borderChanged ? s.borderWidth : 0);
        const contrast = Math.max(
          s.ring?.contrast ?? 0,
          borderChanged ? (s.boundaryContrast ?? 0) : 0
        );
        if (thickness < 2)
          fail(
            ctx,
            entry.hook,
            s.state,
            "focusRing",
            `measured ${round(thickness)} px, expected >= 2 px (outline or ring, plus a changed border)`,
            "WCAG 2.4.11",
            String(round(thickness))
          );
        else if (contrast < 3)
          fail(
            ctx,
            entry.hook,
            s.state,
            "focusRing",
            `measured ${round(contrast)}:1 against the surface, expected >= 3:1`,
            "WCAG 1.4.11",
            String(round(contrast))
          );
      }
      return;
    }
    case "stateDifference": {
      if (!defaultSample) return;
      for (const state of check.states) {
        for (const s of of(state)) {
          const same = check.own
            ? s.ownSignature === defaultSample.ownSignature
            : s.signature === defaultSample.signature;
          if (same)
            fail(
              ctx,
              entry.hook,
              state,
              "stateDifference",
              "renders identically to default (no colour, border, shadow, outline, opacity, weight or transform differs)",
              "state must be perceivable",
              "identical"
            );
        }
      }
      return;
    }
  }
}

function judgeRelation(ctx: Context, relation: Relation) {
  const { viewport } = ctx.scope;
  const first = (hook: string) =>
    ctx.cell.samples.find((s) => s.hook === hook && s.state === "default");
  const read = (prop: NumProp | "paddingX", s: Sample) =>
    prop === "paddingX" ? s.padding[3] : derive(prop, s);
  const named = relation.kind === "equal" ? [relation.a, relation.b] : relation.hooks;
  const absent = named.filter((hook) => first(hook) === undefined);
  if (absent.length > 0) {
    if (relation.kind === "sameWithin" && !inScope(relation.viewports, viewport)) return;
    for (const hook of absent)
      fail(
        ctx,
        hook,
        "default",
        `relation:${relation.kind === "ordered" ? "ordered" : relation.prop}`,
        `hook ${hook} not found on the specimen`,
        relation.source,
        "absent"
      );
    return;
  }

  if (relation.kind === "sameWithin") {
    if (!inScope(relation.viewports, viewport)) return;
    const present = relation.hooks
      .map((hook) => ({ hook, s: first(hook) }))
      .filter((x): x is { hook: string; s: Sample } => x.s !== undefined);
    const values = present.map(({ hook, s }) => ({ hook, v: read(relation.prop, s) }));
    const numeric = values.filter((x): x is { hook: string; v: number } => x.v !== null);
    if (numeric.length < 2) return;
    const lo = Math.min(...numeric.map((x) => x.v));
    const hi = Math.max(...numeric.map((x) => x.v));
    if (hi - lo > relation.tol) {
      const outlier = numeric.find((x) => x.v === hi)!;
      fail(
        ctx,
        outlier.hook,
        "default",
        `relation:${relation.prop}`,
        `measured ${numeric.map((x) => `${x.hook}=${round(x.v)}`).join(", ")}, expected all within ${relation.tol}`,
        relation.source,
        numeric.map((x) => round(x.v)).join("/")
      );
    }
    return;
  }
  if (relation.kind === "equal") {
    const a = first(relation.a);
    const b = first(relation.b);
    if (!a || !b) return;
    const va = derive(relation.prop, a);
    const vb = derive(relation.prop, b);
    if (va === null || vb === null) return;
    if (Math.abs(va - vb) > relation.tol)
      fail(
        ctx,
        relation.a,
        "default",
        `relation:${relation.prop}`,
        `measured ${relation.a}=${round(va)} and ${relation.b}=${round(vb)}, expected within ${relation.tol}`,
        relation.source,
        `${round(va)}/${round(vb)}`
      );
    return;
  }
  const chain = relation.hooks
    .map((hook) => ({ hook, s: first(hook) }))
    .filter((x): x is { hook: string; s: Sample } => x.s !== undefined);
  for (let i = 1; i < chain.length; i++) {
    const big = chain[i - 1]!;
    const small = chain[i]!;
    const ratio = big.s.fontSize / small.s.fontSize;
    if (ratio >= relation.minRatio - 0.001) continue;
    const by = relation.orBy;
    let stated = false;
    if (by?.prop === "fontWeight")
      stated = big.s.fontWeight - small.s.fontWeight >= (by.minStep ?? 100);
    if (by?.prop === "textTransform")
      stated = big.s.textTransform !== small.s.textTransform;
    if (!stated)
      fail(
        ctx,
        small.hook,
        "default",
        "relation:ordered",
        `measured ${big.hook} ${round(big.s.fontSize)} px / ${small.hook} ${round(small.s.fontSize)} px = ${round(ratio)}x (weights ${big.s.fontWeight}/${small.s.fontWeight}), expected >= ${relation.minRatio}x or a ${by?.prop ?? "stated"} step`,
        relation.source,
        `${round(big.s.fontSize)}/${round(small.s.fontSize)}`
      );
  }
}

/** Every failure in one cell (one brand, mode and viewport): entries, relations and axe. */
export function judgeCell(
  scope: CellScope,
  cell: CellMeasurement,
  fonts: Map<number, UsedFont>,
  axe: readonly AxeFinding[]
): Failure[] {
  const ctx: Context = { scope, cell, fonts, failures: [], reported: new Set() };
  const known = new Set(ENTRIES.map((e) => e.hook));
  for (const hook of new Set(cell.samples.map((s) => s.hook))) {
    if (!known.has(hook))
      fail(
        ctx,
        hook,
        "default",
        "spec",
        "no entry in tests/visual/tolerances/spec.ts for this hook",
        "every hook on the specimen is specified"
      );
  }
  for (const entry of ENTRIES) {
    if (!inScope(entry.viewports, scope.viewport)) continue;
    const samples = cell.samples.filter((s) => s.hook === entry.hook);
    for (const state of entry.states) {
      if (!samples.some((s) => s.state === state))
        fail(
          ctx,
          entry.hook,
          state,
          "missing",
          "no element on the specimen (the specimen and the spec have drifted)",
          "spec states must exist"
        );
    }
    for (const check of entry.checks) judgeCheck(ctx, entry, check, samples);
  }
  for (const relation of RELATIONS) judgeRelation(ctx, relation);
  for (const finding of axe)
    fail(
      ctx,
      finding.hook,
      finding.state,
      "axe",
      finding.detail,
      "axe color-contrast",
      finding.detail
    );
  return ctx.failures;
}
