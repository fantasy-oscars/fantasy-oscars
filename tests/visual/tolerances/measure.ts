import type { Page } from "@playwright/test";

/**
 * In-page measurement of every `[data-spec]` element on the specimen, in one
 * `page.evaluate`. Pure data out: the judging happens in Node (judge.ts), so the same
 * measurements serve every check and the spec stays declarative.
 */

export type Rgb = { r: number; g: number; b: number; a: number };

export type Sample = {
  hook: string;
  state: string;
  /** Position among the elements with the same hook and state. */
  index: number;
  width: number;
  height: number;
  /** Size of the nearest interactive ancestor (or the element), the area a finger hits. */
  hitWidth: number;
  hitHeight: number;
  padding: [number, number, number, number];
  gap: number;
  borderWidth: number;
  borderStyle: string;
  borderColor: string;
  /** Top-left corner radius in px, or "percent" when the value is a percentage. */
  radius: number | "percent";
  fontFamily: string;
  fontSize: number;
  /** Line height in px; `null` for `normal`. */
  lineHeight: number | null;
  fontWeight: number;
  letterSpacing: number;
  textTransform: string;
  fontStyle: string;
  /** Font size of the first icon glyph inside, if any. */
  iconSize: number | null;
  /** Text colour composited over the effective background, `null` when no solid background resolves. */
  textContrast: number | null;
  /** Colour of the icon glyph inside (or the element itself) against the surface behind it; `null` without an icon. */
  iconContrast: number | null;
  /** Large text (>= 24px, or >= 18.66px bold) needs 3:1 instead of 4.5:1. */
  largeText: boolean;
  /** Border colour against the surface the element sits on (the UI-boundary contrast). */
  boundaryContrast: number | null;
  /** Fill colour against the surface the element sits on. */
  fillContrast: number | null;
  /** Outline or box-shadow ring: width in px and contrast against the surface, or `null` when none. */
  ring: { width: number; contrast: number | null; source: "outline" | "shadow" } | null;
  /** Everything that can differ between states, as one comparable string. */
  signature: string;
  /**
   * The same for the element and its text carrier only, so a state that also adds or
   * swaps a child (a check mark, a trophy) cannot satisfy a difference check by structure.
   */
  ownSignature: string;
  /** Marked for the platform-font probe (see `data-spec-text`). */
  textCarrier: boolean;
};

export type CellMeasurement = {
  /** Contract custom properties resolved to px where they are lengths, else as written. */
  tokens: Record<string, string>;
  /** Every `--fo-space-*` value in px: the spacing scale. */
  scale: number[];
  samples: Sample[];
  /** Hooks with no element on the page (a stale or broken specimen). */
  missingHooks: string[];
};

/** Resolved by name from the page; the spec references these slots. */
export const TOKEN_NAMES = [
  "--brand-radius-sm",
  "--brand-radius-md",
  "--brand-radius-lg",
  "--brand-button-radius",
  "--brand-border-width",
  "--brand-h1-size",
  "--brand-h2-size",
  "--brand-h3-size",
  "--brand-body-size",
  "--brand-nav-size",
  "--fo-control-height",
  "--fo-control-padding-x",
  "--fo-touch-target",
  "--fo-focus-ring-width",
  "--fo-menu-item-height",
  "--fo-menu-item-paddingX",
  "--fo-heading-h4-size",
  "--fo-header-control-size",
  "--fo-header-icon-size",
  "--fo-font-size-xs",
  "--fo-font-size-sm",
  "--fo-font-size-md",
  "--fo-border-width-strong"
] as const;

/** Slots whose value is not a length (or is one in `em`): kept as written. */
export const RAW_TOKEN_NAMES = [
  "--brand-nav-case",
  "--brand-label-case",
  "--brand-label-letter-spacing",
  "--brand-nav-active",
  "--brand-home-hero-max",
  "--brand-display-weight",
  "--brand-wordmark-weight",
  "--brand-wordmark-letter-spacing",
  "--brand-wordmark-case",
  "--brand-room-title-weight"
] as const;

/** Font slots: first family of each, as the page declares it. */
export const FONT_SLOT_NAMES = [
  "--brand-font-display",
  "--brand-font-body",
  "--brand-font-numeral",
  "--brand-font-label",
  "--brand-nav-font",
  "--brand-wordmark-font",
  "--brand-room-font-work",
  "--brand-room-font-title"
] as const;

export async function measureCell(page: Page): Promise<CellMeasurement> {
  return page.evaluate(
    ([tokenNames, fontNames, rawNames]) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const parse = (css: string): Rgb | null => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return { r: r!, g: g!, b: b!, a: a! / 255 };
      };
      const over = (top: Rgb, below: Rgb): Rgb => {
        const a = top.a + below.a * (1 - top.a);
        if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
        const mix = (t: number, u: number) => (t * top.a + u * below.a * (1 - top.a)) / a;
        return {
          r: mix(top.r, below.r),
          g: mix(top.g, below.g),
          b: mix(top.b, below.b),
          a
        };
      };
      const lum = (c: Rgb) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const ratio = (a: Rgb, b: Rgb) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
        return (hi + 0.05) / (lo + 0.05);
      };
      const px = (value: string) => {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : 0;
      };

      /** Surface colour behind `el`: ancestors' backgrounds composited, or null under an image. */
      const surfaceBehind = (el: Element | null): Rgb | null => {
        const layers: Rgb[] = [];
        for (let node = el; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.backgroundImage !== "none") return null;
          const bg = parse(style.backgroundColor);
          if (bg && bg.a > 0) layers.push(bg);
          if (bg && bg.a === 1) break;
        }
        let out: Rgb = { r: 255, g: 255, b: 255, a: 1 };
        for (const layer of layers.reverse()) out = over(layer, out);
        return out;
      };

      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none;transition:none";
      document.body.appendChild(probe);
      const rootStyle = getComputedStyle(document.documentElement);
      const tokens: Record<string, string> = {};
      for (const name of tokenNames) {
        probe.style.paddingLeft = `var(${name})`;
        const resolved = getComputedStyle(probe).paddingLeft;
        const raw = rootStyle.getPropertyValue(name).trim();
        tokens[name] = raw.endsWith("%") ? raw : resolved;
      }
      for (const name of fontNames) {
        tokens[name] = rootStyle.getPropertyValue(name).trim();
      }
      for (const name of rawNames) {
        tokens[name] = rootStyle.getPropertyValue(name).trim();
      }
      const scale: number[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSStyleRule)) continue;
          for (const name of Array.from(rule.style)) {
            if (!name.startsWith("--fo-space-") || name in tokens) continue;
            probe.style.paddingLeft = `var(${name})`;
            tokens[name] = getComputedStyle(probe).paddingLeft;
            scale.push(px(tokens[name]));
          }
        }
      }
      probe.remove();

      const samples: Sample[] = [];
      const seen = new Map<string, number>();
      const hooks = new Set<string>();
      for (const el of Array.from(document.querySelectorAll("[data-spec]"))) {
        const hook = el.getAttribute("data-spec")!;
        const state = el.getAttribute("data-spec-state") ?? "default";
        hooks.add(hook);
        const key = `${hook}|${state}`;
        const index = seen.get(key) ?? 0;
        seen.set(key, index + 1);

        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        // The element that holds the words: the hook itself, or its first descendant with
        // text of its own (icon glyphs excluded, their "text" is a ligature name).
        const holdsText = (node: Element) =>
          !node.matches(".mi-icon, [aria-hidden='true']") &&
          Array.from(node.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""
          );
        const textEl0 = holdsText(el)
          ? el
          : Array.from(el.querySelectorAll("*")).find(holdsText);
        const fontEl = textEl0 ?? el;
        const fontStyleOf = getComputedStyle(fontEl);
        const hitEl =
          el.closest(
            "button, a[href], label, [role='button'], .mantine-Checkbox-root, .mantine-Switch-root"
          ) ?? el;
        const hit = hitEl.getBoundingClientRect();
        const lineHeight =
          fontStyleOf.lineHeight === "normal" ? null : px(fontStyleOf.lineHeight);
        const weight = px(fontStyleOf.fontWeight);
        const fontSize = px(fontStyleOf.fontSize);
        const icon = el.matches(".mi-icon") ? el : el.querySelector(".mi-icon");
        for (const old of Array.from(el.querySelectorAll("[data-spec-text]")))
          old.removeAttribute("data-spec-text");
        el.removeAttribute("data-spec-text");
        const carrier = textEl0;
        carrier?.setAttribute("data-spec-text", String(samples.length));

        const surface = surfaceBehind(el.parentElement);
        const bg = parse(style.backgroundColor);
        const textSurface = carrier ? surfaceBehind(carrier) : null;
        const fg = carrier ? parse(fontStyleOf.color) : null;
        const textColor = fg && textSurface ? over(fg, textSurface) : null;
        const boundary = parse(style.borderTopColor);
        const boundaryOn =
          boundary && surface && px(style.borderTopWidth) > 0 && boundary.a > 0
            ? ratio(over(boundary, surface), surface)
            : null;
        const fillOn =
          bg && surface && bg.a > 0 ? ratio(over(bg, surface), surface) : null;

        const iconFg = icon ? parse(getComputedStyle(icon).color) : null;
        const iconSurface = icon ? surfaceBehind(icon.parentElement) : null;
        const iconOwn = icon ? parse(getComputedStyle(icon).backgroundColor) : null;
        const iconBase =
          iconSurface && iconOwn && iconOwn.a > 0
            ? over(iconOwn, iconSurface)
            : iconSurface;
        const iconOn =
          iconFg && iconBase ? ratio(over(iconFg, iconBase), iconBase) : null;

        let ring: Sample["ring"] = null;
        const outlineWidth = px(style.outlineWidth);
        if (style.outlineStyle !== "none" && outlineWidth > 0) {
          const color = parse(style.outlineColor);
          ring = {
            width: outlineWidth,
            source: "outline",
            contrast: color && surface ? ratio(over(color, surface), surface) : null
          };
        } else {
          // The first drop-shadow (non-inset) layer with a visible colour, as "colour offx offy blur spread".
          const layers =
            style.boxShadow === "none" ? [] : style.boxShadow.split(/,(?![^(]*\))/);
          for (const layer of layers) {
            if (/inset/.test(layer)) continue;
            const colorText = layer.match(
              /(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]+)/i
            )?.[0];
            const lengths = (
              layer.replace(colorText ?? "", "").match(/-?[\d.]+px/g) ?? []
            ).map(px);
            const [, , blur = 0, spread = 0] = lengths;
            const width = spread > 0 ? spread : 0;
            const color = colorText ? parse(colorText) : null;
            if (!color || color.a === 0 || (width === 0 && blur === 0)) continue;
            ring = {
              width,
              source: "shadow",
              contrast: surface ? ratio(over(color, surface), surface) : null
            };
            break;
          }
        }

        const signatureProps = [
          "color",
          "backgroundColor",
          "borderTopColor",
          "borderTopWidth",
          "boxShadow",
          "outlineColor",
          "outlineStyle",
          "outlineWidth",
          "opacity",
          "textDecorationLine",
          "transform",
          "filter",
          "fontWeight",
          "fontStyle"
        ] as const;
        const parts: string[] = [];
        for (const node of [el, ...Array.from(el.querySelectorAll("*")).slice(0, 8)]) {
          const s = getComputedStyle(node);
          parts.push(signatureProps.map((p) => s[p]).join("|"));
        }
        const ownParts = [el, carrier ?? el].map((node) => {
          const s = getComputedStyle(node);
          return signatureProps.map((p) => s[p]).join("|");
        });
        // A disabled control often dims a wrapper, not the element itself.
        let wrapper = el.parentElement;
        for (
          let depth = 0;
          wrapper && depth < 3;
          depth++, wrapper = wrapper.parentElement
        ) {
          parts.push(`wrap:${getComputedStyle(wrapper).opacity}`);
          ownParts.push(`wrap:${getComputedStyle(wrapper).opacity}`);
        }

        samples.push({
          hook,
          state,
          index,
          width: rect.width,
          height: rect.height,
          hitWidth: hit.width,
          hitHeight: hit.height,
          padding: [
            px(style.paddingTop),
            px(style.paddingRight),
            px(style.paddingBottom),
            px(style.paddingLeft)
          ],
          gap: px(style.columnGap),
          borderWidth: px(style.borderTopWidth),
          borderStyle: style.borderTopStyle,
          borderColor: style.borderTopColor,
          radius: style.borderTopLeftRadius.includes("%")
            ? "percent"
            : px(style.borderTopLeftRadius),
          fontFamily: fontStyleOf.fontFamily,
          fontSize,
          lineHeight,
          fontWeight: weight,
          letterSpacing:
            fontStyleOf.letterSpacing === "normal" ? 0 : px(fontStyleOf.letterSpacing),
          textTransform: fontStyleOf.textTransform,
          fontStyle: fontStyleOf.fontStyle,
          iconSize: icon ? px(getComputedStyle(icon).fontSize) : null,
          textContrast: textColor && textSurface ? ratio(textColor, textSurface) : null,
          iconContrast: iconOn,
          largeText: fontSize >= 24 || (fontSize >= 18.66 && weight >= 700),
          boundaryContrast: boundaryOn,
          fillContrast: fillOn,
          ring,
          signature: parts.join("#"),
          ownSignature: ownParts.join("#"),
          textCarrier: Boolean(carrier)
        });
      }
      return {
        tokens,
        scale: [...new Set(scale)].sort((a, b) => a - b),
        samples,
        missingHooks: []
      };
    },
    [TOKEN_NAMES, FONT_SLOT_NAMES, RAW_TOKEN_NAMES] as const
  );
}
