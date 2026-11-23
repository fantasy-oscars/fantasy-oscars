import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { Mode } from "../matrix";
import {
  decodeColor,
  FLOOR_CSS,
  INHERITABLE_TOKENS,
  probeStressCss,
  tokenOf
} from "../fixtures/probeStressTheme";
import { AXE_SOURCE } from "./pageChecks";

// Contrast pair usage, recorded by the screen sweep in the probe-stress theme and checked
// against every theme's token values by the contrast rule (contrastRule.ts). A pair is the
// foreground's colour expression, the stack of background expressions under it (bottom
// first) and the threshold its text size sets. Expressions are CSS over brand-layer
// properties (`var(--brand-muted)`, `rgba(var(--brand-text-rgb), 0.06)`), or literals for
// colours no theme can change.

/** `normal` and `large` text as axe's color-contrast rule judges them; placeholders and room icons as their checks do. */
export type Bucket = "normal" | "large" | "placeholder" | "non-text";

export type Pair = {
  fg: string;
  /** The parent's colour, used where `fg` resolves to `inherit` in a theme. */
  inherit?: string;
  /** Bottom first; `image` marks a background image or gradient. */
  layers: string[];
  bucket: Bucket;
};

export type RegistryEntry = Pair & { modes: Mode[]; screens: string[] };

/** Text axe reports as incomplete (over an image, gradient or overlap): listed, not checked. */
export type UncheckedEntry = {
  fg: string;
  reason: string;
  modes: Mode[];
  screens: string[];
};

export type Registry = {
  regenerate: string;
  pairs: RegistryEntry[];
  unchecked: UncheckedEntry[];
};

export const REGISTRY_PATH = "tests/visual/assertions/pairs.json";
export const REGENERATE_COMMAND = "node tests/visual/run.mjs --tier assertions --update";

export function pairKey(p: Pair): string {
  const fg = p.inherit ? `${p.fg} (else ${p.inherit})` : p.fg;
  return `${fg} on ${p.layers.join(" > ")} [${p.bucket}]`;
}

export function uncheckedKey(u: { fg: string; reason: string }): string {
  return `${u.fg} [${u.reason}]`;
}

export function loadRegistry(): Registry {
  if (!existsSync(REGISTRY_PATH))
    return { regenerate: REGENERATE_COMMAND, pairs: [], unchecked: [] };
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as Registry;
}

export function saveRegistry(registry: Registry) {
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
}

/** One observation on one screen in one mode. */
export type ObservedPair = Pair & { screen: string; mode: Mode };
export type ObservedUnchecked = {
  fg: string;
  reason: string;
  screen: string;
  mode: Mode;
};

type RawLayer = { read: number; opacity: number; image: boolean };
type RawNode = {
  kind: "text" | "placeholder" | "icon" | "punchout";
  desc: string;
  fg: number;
  parent: number;
  opacity: number;
  layers: RawLayer[];
  large: boolean;
};
type RawRecord = {
  nodes: RawNode[];
  incomplete: { desc: string; fg: number; reason: string }[];
  reads: string[];
};

/**
 * Reads every text node axe's color-contrast rule evaluates, every shown placeholder and,
 * in the draft room, every icon: the computed colour of each foreground and of each
 * background layer under it. The elements are kept in the page so the same colours can be
 * read again under the second palette.
 */
async function readPage(page: Page, roomIcons: boolean): Promise<RawRecord> {
  await page.evaluate((source) => {
    if (!(window as unknown as { axe?: unknown }).axe) (0, eval)(source);
  }, AXE_SOURCE);
  return page.evaluate(
    async ([floorCss, withIcons]) => {
      type AxeNode = {
        element: Element;
        any: { data?: { messageKey?: string } | null }[];
      };
      type AxeApi = {
        run: (
          context: Document,
          options: Record<string, unknown>
        ) => Promise<{
          passes: { nodes: AxeNode[] }[];
          violations: { nodes: AxeNode[] }[];
          incomplete: { nodes: AxeNode[] }[];
        }>;
        setup: (node: Document) => void;
        teardown: () => void;
        commons: {
          color: {
            getBackgroundStack: (el: Element) => Element[] | null;
            elementHasImage: (el: Element, style: CSSStyleDeclaration) => boolean;
          };
        };
      };
      const axe = (window as unknown as { axe: AxeApi }).axe;
      const results = await axe.run(document, {
        runOnly: { type: "rule", values: ["color-contrast"] },
        elementRef: true
      });

      type Prop = "color" | "bg" | "placeholder";
      const reads: Array<[Element, Prop]> = [];
      const read = (el: Element, prop: Prop) => {
        reads.push([el, prop]);
        return reads.length - 1;
      };
      const describe = (el: Element) => {
        const cls =
          typeof el.className === "string" && el.className.trim()
            ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
            : "";
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
        return `${el.tagName.toLowerCase()}${cls} "${text}"`;
      };
      const opacityChain = (el: Element | null) => {
        let product = 1;
        for (let n = el; n; n = n.parentElement)
          product *= Number(getComputedStyle(n).opacity);
        return product;
      };
      const ancestorsLayers = (start: Element | null) => {
        const chain: Element[] = [];
        for (let n = start; n; n = n.parentElement) chain.push(n);
        return chain;
      };
      const layer = (el: Element) => {
        const style = getComputedStyle(el);
        return {
          read: read(el, "bg"),
          opacity: Number(style.opacity),
          image: axe.commons.color.elementHasImage(el, style)
        };
      };
      // Layers bottom first, skipping elements that paint no background at all.
      const layersOf = (stack: Element[]) =>
        stack
          .filter((el) => {
            const style = getComputedStyle(el);
            return (
              style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
              axe.commons.color.elementHasImage(el, style)
            );
          })
          .reverse()
          .map(layer);
      const isLarge = (el: Element) => {
        const style = getComputedStyle(el);
        const size = parseFloat(style.fontSize);
        const weight = style.fontWeight;
        const bold = parseFloat(weight) >= 700 || weight === "bold";
        const pt = Math.ceil(size * 72) / 96;
        return bold ? pt >= 14 : pt >= 18;
      };

      const nodes: RawNode[] = [];
      const nodeEls: Element[] = [];
      const add = (el: Element, node: RawNode) => {
        nodes.push(node);
        nodeEls.push(el);
      };
      const incomplete: RawRecord["incomplete"] = [];
      axe.setup(document);
      try {
        for (const node of [
          ...results.passes.flatMap((r) => r.nodes),
          ...results.violations.flatMap((r) => r.nodes)
        ]) {
          const el = node.element;
          if (node.any[0]?.data?.messageKey === "hidden") continue;
          const stack = axe.commons.color.getBackgroundStack(el);
          if (!stack) {
            incomplete.push({
              desc: describe(el),
              fg: read(el, "color"),
              reason: "bgOverlap"
            });
            continue;
          }
          add(el, {
            kind: "text",
            desc: describe(el),
            fg: read(el, "color"),
            parent: read(el.parentElement ?? el, "color"),
            opacity: opacityChain(el),
            layers: layersOf(stack),
            large: isLarge(el)
          });
        }
      } finally {
        axe.teardown();
      }
      for (const node of results.incomplete.flatMap((r) => r.nodes)) {
        incomplete.push({
          desc: describe(node.element),
          fg: read(node.element, "color"),
          reason: node.any[0]?.data?.messageKey ?? "incomplete"
        });
      }

      const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input[placeholder], textarea[placeholder]"
      );
      for (const el of fields) {
        if (el.value || !el.placeholder || !el.checkVisibility()) continue;
        add(el, {
          kind: "placeholder",
          desc: `${el.tagName.toLowerCase()}::placeholder "${el.placeholder.slice(0, 30)}"`,
          fg: read(el, "placeholder"),
          parent: read(el, "color"),
          opacity: Number(getComputedStyle(el, "::placeholder").opacity || 1),
          layers: layersOf(ancestorsLayers(el)),
          large: false
        });
      }

      if (withIcons) {
        for (const icon of document.querySelectorAll(
          ".dr-frame .mi-icon, .dr-frame .gicon"
        )) {
          if (!icon.checkVisibility()) continue;
          add(icon, {
            kind: "icon",
            desc: describe(icon),
            fg: read(icon, "color"),
            parent: read(icon.parentElement ?? icon, "color"),
            opacity: 1,
            layers: layersOf(ancestorsLayers(icon)),
            large: false
          });
          if (icon.classList.contains("dr-icon-punchout")) {
            add(icon, {
              kind: "punchout",
              desc: `${describe(icon)} circle`,
              fg: read(icon, "bg"),
              parent: read(icon, "bg"),
              opacity: 1,
              layers: layersOf(ancestorsLayers(icon.parentElement)),
              large: false
            });
          }
        }
      }

      // Size bucket at the geometry floor: large only when large at both.
      const floor = document.createElement("style");
      floor.textContent = floorCss;
      document.head.append(floor);
      nodes.forEach((node, i) => {
        if (node.kind === "text") node.large = node.large && isLarge(nodeEls[i]!);
      });
      floor.remove();

      (window as unknown as { __foReads: Array<[Element, Prop]> }).__foReads = reads;
      const readNow = ([el, prop]: [Element, Prop]) => {
        const style = getComputedStyle(
          el,
          prop === "placeholder" ? "::placeholder" : null
        );
        if (prop === "bg") return style.backgroundColor;
        return style.getPropertyValue("-webkit-text-fill-color") || style.color;
      };
      return {
        nodes,
        incomplete,
        reads: reads.map(readNow)
      };
    },
    [FLOOR_CSS, roomIcons] as const
  );
}

/**
 * Re-reads the recorded colours: as painted now, or with the probe stylesheet swapped for
 * `css` (the second palette) and swapped back.
 */
async function reread(page: Page, css: string | null): Promise<string[]> {
  return page.evaluate((nextCss) => {
    const style = document.getElementById("fo-probe-stress");
    if (!style) throw new Error("the probe-stress stylesheet is not in the page");
    const previous = style.textContent;
    if (nextCss !== null) style.textContent = nextCss;
    const reads = (window as unknown as { __foReads: Array<[Element, string]> })
      .__foReads;
    const out = reads.map(([el, prop]) => {
      const s = getComputedStyle(el, prop === "placeholder" ? "::placeholder" : null);
      if (prop === "bg") return s.backgroundColor;
      return s.getPropertyValue("-webkit-text-fill-color") || s.color;
    });
    if (nextCss !== null) style.textContent = previous;
    return out;
  }, css);
}

const PALETTE_B = probeStressCss(1);

/** Opacity folded into an expression, as a mix with transparent. */
function withOpacity(expr: string, opacity: number): string {
  if (opacity >= 0.999) return expr;
  return `color-mix(in srgb, ${expr} ${Math.round(opacity * 1000) / 10}%, transparent)`;
}

export type RecordResult = {
  pairs: ObservedPair[];
  unchecked: ObservedUnchecked[];
  /** Colours that could not be traced to the brand layer or shown to be constant. */
  problems: string[];
};

/**
 * Records the contrast pairs of a loaded screen painted in the probe-stress theme, in each
 * mode. axe chooses the text and its background stacks once; each mode then re-reads the
 * same colours (`repaint` switches the page to that mode). A colour that is the same under
 * both palettes is a literal; otherwise both palettes must decode to the same brand-layer
 * expression.
 */
export async function recordPairs(
  page: Page,
  screen: string,
  roomIcons: boolean,
  modes: readonly Mode[],
  repaint: (mode: Mode) => Promise<void>
): Promise<RecordResult> {
  const raw = await readPage(page, roomIcons);
  const out: RecordResult = { pairs: [], unchecked: [], problems: [] };
  for (const [i, mode] of modes.entries()) {
    if (i > 0) await repaint(mode);
    const first = i === 0 ? raw.reads : await reread(page, null);
    const second = await reread(page, PALETTE_B);
    const result = buildPairs(raw, first, second, screen, mode);
    out.pairs.push(...result.pairs);
    out.unchecked.push(...result.unchecked);
    out.problems.push(...result.problems);
  }
  out.problems = [...new Set(out.problems)];
  return out;
}

function buildPairs(
  raw: RawRecord,
  first: readonly string[],
  second: readonly string[],
  screen: string,
  mode: Mode
): RecordResult {
  const problems: string[] = [];
  const decoded = first.map((a, i) => {
    const b = second[i]!;
    if (a === b) {
      const d = decodeColor(a, mode, 0);
      return d.kind === "transparent" ? null : d.expr;
    }
    const da = decodeColor(a, mode, 0);
    const db = decodeColor(b, mode, 1);
    if (da.kind === "token" && db.kind === "token" && da.expr === db.expr) return da.expr;
    if (da.kind === "transparent" && db.kind === "transparent") return null;
    return { undecodable: `${a} / ${b}` };
  });
  const expr = (index: number, desc: string): string | null => {
    const d = decoded[index];
    if (d && typeof d === "object") {
      problems.push(
        `${desc}: colour ${d.undecodable} is neither a brand-layer property nor constant`
      );
      return null;
    }
    return d ?? null;
  };

  const pairs: ObservedPair[] = [];
  for (const node of raw.nodes) {
    const fg = expr(node.fg, node.desc);
    if (!fg) continue;
    const layers: string[] = [];
    let broken = false;
    for (const l of node.layers) {
      if (l.image) {
        layers.push("image");
        continue;
      }
      const e = expr(l.read, node.desc);
      if (e === null && decoded[l.read] && typeof decoded[l.read] === "object")
        broken = true;
      if (e) layers.push(withOpacity(e, l.opacity));
    }
    if (broken) continue;
    const token = tokenOf(fg);
    const inherit =
      token && INHERITABLE_TOKENS.has(token)
        ? (expr(node.parent, node.desc) ?? undefined)
        : undefined;
    const bucket: Bucket =
      node.kind === "placeholder"
        ? "placeholder"
        : node.kind === "text"
          ? node.large
            ? "large"
            : "normal"
          : "non-text";
    pairs.push({
      fg: withOpacity(fg, node.opacity),
      ...(inherit ? { inherit: withOpacity(inherit, node.opacity) } : {}),
      layers,
      bucket,
      screen,
      mode
    });
  }
  const unchecked = raw.incomplete.flatMap((u) => {
    const fg = expr(u.fg, u.desc);
    return fg ? [{ fg, reason: u.reason, screen, mode }] : [];
  });
  return { pairs, unchecked, problems: [...new Set(problems)] };
}

/** Builds the registry file from every observation of a complete sweep. */
export function buildRegistry(
  pairs: readonly ObservedPair[],
  unchecked: readonly ObservedUnchecked[]
): Registry {
  const byKey = new Map<string, RegistryEntry>();
  for (const p of pairs) {
    const key = pairKey(p);
    const entry =
      byKey.get(key) ??
      ({
        fg: p.fg,
        ...(p.inherit ? { inherit: p.inherit } : {}),
        layers: p.layers,
        bucket: p.bucket,
        modes: [],
        screens: []
      } as RegistryEntry);
    if (!entry.modes.includes(p.mode)) entry.modes.push(p.mode);
    if (!entry.screens.includes(p.screen)) entry.screens.push(p.screen);
    byKey.set(key, entry);
  }
  const uncheckedByKey = new Map<string, UncheckedEntry>();
  for (const u of unchecked) {
    const key = uncheckedKey(u);
    const entry = uncheckedByKey.get(key) ?? {
      fg: u.fg,
      reason: u.reason,
      modes: [],
      screens: []
    };
    if (!entry.modes.includes(u.mode)) entry.modes.push(u.mode);
    if (!entry.screens.includes(u.screen)) entry.screens.push(u.screen);
    uncheckedByKey.set(key, entry);
  }
  const tidy = <T extends { modes: Mode[]; screens: string[] }>(e: T) => ({
    ...e,
    modes: [...e.modes].sort(),
    screens: [...e.screens].sort()
  });
  return {
    regenerate: REGENERATE_COMMAND,
    pairs: [...byKey].sort(([a], [b]) => a.localeCompare(b)).map(([, e]) => tidy(e)),
    unchecked: [...uncheckedByKey]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, e]) => tidy(e))
  };
}

/** `key|mode` for every pair and unchecked entry a registry holds. */
export function registryKeys(registry: Registry): Set<string> {
  return new Set([
    ...registry.pairs.flatMap((p) => p.modes.map((m) => `pair ${pairKey(p)} (${m})`)),
    ...registry.unchecked.flatMap((u) =>
      u.modes.map((m) => `unchecked ${uncheckedKey(u)} (${m})`)
    )
  ]);
}

export function observedKey(p: ObservedPair): string {
  return `pair ${pairKey(p)} (${p.mode})`;
}

export function observedUncheckedKey(u: ObservedUnchecked): string {
  return `unchecked ${uncheckedKey(u)} (${u.mode})`;
}
