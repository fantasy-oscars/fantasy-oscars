import { describe, expect, it } from "vitest";
import {
  BRAND_DEFINITIONS,
  COLOR_SLOTS,
  MODES,
  SHADOW_SLOTS,
  sharedByMode,
  sharedConstants,
  type BrandDefinition,
  type Mode
} from "@/theme/brands";
import { colorChannels } from "@/theme/brands/css";

/**
 * Token tests: every brand (enabled or gated) in both modes defines every contract
 * slot with a value of the right kind, and every text/background pair the contract
 * relies on meets its threshold. The pair table below is the single list; it follows
 * docs/design/prescriptions/02-brand-tokens.md section 3 (3.0 slot rules, 3.0b contrast
 * notation, 3.3 and 3.3a shared tokens) and section 4.5 for the focus ring.
 */

type Rgb = [number, number, number];

function rgb(value: string): Rgb {
  return colorChannels(value)
    .split(",")
    .map((c) => Number(c)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `.dr-card`: the text colour at 3 % over the page. */
function draftCard(text: Rgb, page: Rgb): Rgb {
  return page.map((c, i) => c * 0.97 + text[i]! * 0.03) as Rgb;
}

/** Backgrounds a foreground can sit on. */
const BACKGROUNDS = ["page", "surface", "raised", "sunken", "draftCard"] as const;
type Background = (typeof BACKGROUNDS)[number];

type Resolved = Record<string, Rgb>;

/** Every colour a pair can name: the brand's slots plus the shared tokens for the mode. */
function resolve(brand: BrandDefinition, mode: Mode): Resolved {
  const { colors } = brand.modes[mode];
  const out: Resolved = {};
  for (const slot of COLOR_SLOTS) out[slot] = rgb(colors[slot]);
  out.draftCard = draftCard(out.text!, out.page!);
  const shared = sharedByMode[mode];
  out.dangerText = rgb(shared["--fo-danger-text"]);
  out.winGoldText = rgb(shared["--fo-win-gold-text"]);
  out.winGold = rgb(shared["--fo-win-gold"]);
  out.winGoldOn = rgb(shared["--fo-win-gold-on"]);
  out.danger = rgb(sharedConstants["--fo-danger"]);
  out.dangerOn = rgb(sharedConstants["--fo-danger-on"]);
  return out;
}

/** WCAG 2.x thresholds: 4.5 for body text, 3.0 for large text and UI boundaries. */
const BODY_TEXT = 4.5;
const BOUNDARY = 3;

type Pair = {
  /** Foreground colour name (a contract slot or a shared token, see `resolve`). */
  fg: string;
  /** Background colours it sits on. */
  on: readonly (Background | string)[];
  min: number;
  /** Where the contract uses the pair. */
  use: string;
};

const ALL_BACKGROUNDS = BACKGROUNDS;

export const PAIRS: readonly Pair[] = [
  { fg: "text", on: ALL_BACKGROUNDS, min: BODY_TEXT, use: "body ink" },
  { fg: "muted", on: ALL_BACKGROUNDS, min: BODY_TEXT, use: "meta text, inactive nav" },
  { fg: "link", on: ALL_BACKGROUNDS, min: BODY_TEXT, use: "anchor colour" },
  { fg: "linkHover", on: ALL_BACKGROUNDS, min: BODY_TEXT, use: "anchor hover colour" },
  {
    fg: "accent",
    on: ALL_BACKGROUNDS,
    min: BODY_TEXT,
    use: "second hue, may be painted as small text (nav, wordmark)"
  },
  { fg: "dangerText", on: ALL_BACKGROUNDS, min: BODY_TEXT, use: "form and page errors" },
  {
    fg: "winGoldText",
    on: ALL_BACKGROUNDS,
    min: BOUNDARY,
    use: "gold wordmark (32 px logotype) and active-nav line; large text and lines, not body text"
  },
  {
    fg: "ruleStrong",
    on: ALL_BACKGROUNDS,
    min: BOUNDARY,
    use: "input borders, hover rings, overlay rings"
  },
  { fg: "focusRing", on: ALL_BACKGROUNDS, min: BOUNDARY, use: "focus outline" },
  { fg: "onPrimary", on: ["primary"], min: BODY_TEXT, use: "label on filled buttons" },
  { fg: "winGoldOn", on: ["winGold"], min: BODY_TEXT, use: "label on a won pill" },
  { fg: "dangerOn", on: ["danger"], min: BODY_TEXT, use: "label on the danger fill" }
];

/**
 * Known failures, kept explicit so everything else stays strict. An entry names the
 * brand, mode, foreground and background, the ratio measured on the date, and why it is
 * accepted. Remove an entry when the token is fixed; the test fails if an entry no
 * longer fails (so a fix cannot leave a stale exception behind).
 */
type Exception = {
  brand: string;
  mode: Mode;
  fg: string;
  bg: string;
  /** Ratio at `date`, floored to two decimals. */
  measured: number;
  date: string;
  reason: string;
};

/** 02-brand-tokens.md 3.0: red-carpet dark accent (velvet) is fill only, never painted as text. */
const ACCENT_FILL_ONLY =
  "accent is the velvet fill in red-carpet dark; the prescription marks it fill only (no text or thin-line reader)";

export const EXCEPTIONS: readonly Exception[] = [
  {
    brand: "red-carpet",
    mode: "dark",
    fg: "accent",
    bg: "page",
    measured: 1.71,
    date: "2026-11-04",
    reason: ACCENT_FILL_ONLY
  },
  {
    brand: "red-carpet",
    mode: "dark",
    fg: "accent",
    bg: "surface",
    measured: 1.61,
    date: "2026-11-04",
    reason: ACCENT_FILL_ONLY
  },
  {
    brand: "red-carpet",
    mode: "dark",
    fg: "accent",
    bg: "raised",
    measured: 1.61,
    date: "2026-11-04",
    reason: ACCENT_FILL_ONLY
  },
  {
    brand: "red-carpet",
    mode: "dark",
    fg: "accent",
    bg: "sunken",
    measured: 1.48,
    date: "2026-11-04",
    reason: ACCENT_FILL_ONLY
  },
  {
    brand: "red-carpet",
    mode: "dark",
    fg: "accent",
    bg: "draftCard",
    measured: 1.63,
    date: "2026-11-04",
    reason: ACCENT_FILL_ONLY
  }
];

function key(brand: string, mode: string, fg: string, bg: string) {
  return `${brand}|${mode}|${fg}|${bg}`;
}

const exceptionKeys = new Map(
  EXCEPTIONS.map((e) => [key(e.brand, e.mode, e.fg, e.bg), e] as const)
);

const LENGTH = /^(0|-?\d*\.?\d+(px|rem|em|%|vw|vh)|clamp\(.+\)|calc\(.+\))$/;
const SPACING = /^(normal|0|-?\d*\.?\d+(px|rem|em))$/;

describe("brand tokens", () => {
  it("covers every defined brand and both modes", () => {
    expect(BRAND_DEFINITIONS).toHaveLength(7);
    expect(MODES).toEqual(["light", "dark"]);
  });

  it("keeps the pair table non-trivial", () => {
    const count = PAIRS.reduce((n, p) => n + p.on.length, 0);
    expect(count).toBeGreaterThanOrEqual(40);
  });

  describe.each(BRAND_DEFINITIONS.map((b) => [b.id, b] as const))("%s", (_id, brand) => {
    describe.each(MODES)("%s", (mode) => {
      it("defines every colour slot as a parseable colour", () => {
        const { colors } = brand.modes[mode];
        for (const slot of COLOR_SLOTS) {
          expect(colors[slot], slot).toEqual(expect.any(String));
          expect(() => colorChannels(colors[slot]), slot).not.toThrow();
        }
      });

      it("defines every shadow slot", () => {
        for (const slot of SHADOW_SLOTS) {
          expect(brand.modes[mode].shadows[slot].trim(), slot).not.toBe("");
        }
      });

      it("meets the threshold of every text/background pair", () => {
        const colors = resolve(brand, mode);
        const failures: string[] = [];
        const stale: string[] = [];
        for (const pair of PAIRS) {
          for (const bg of pair.on) {
            const value = ratio(colors[pair.fg]!, colors[bg]!);
            const known = exceptionKeys.get(key(brand.id, mode, pair.fg, bg));
            if (value >= pair.min) {
              if (known) stale.push(`${pair.fg} on ${bg} now passes at ${value}`);
            } else if (!known) {
              failures.push(
                `${pair.fg} on ${bg}: ${value.toFixed(2)} < ${pair.min} (${pair.use})`
              );
            }
          }
        }
        expect(failures).toEqual([]);
        expect(stale).toEqual([]);
      });
    });

    it("defines every length slot as a length", () => {
      const { shape, type, navigation } = brand;
      for (const [name, value] of Object.entries({
        radiusSm: shape.radiusSm,
        radiusMd: shape.radiusMd,
        radiusLg: shape.radiusLg,
        borderWidth: shape.borderWidth,
        h1Size: type.h1Size,
        h2Size: type.h2Size,
        h3Size: type.h3Size,
        bodySize: type.bodySize,
        navSize: navigation.size
      })) {
        expect(value, name).toMatch(LENGTH);
      }
      for (const [name, value] of Object.entries({
        labelLetterSpacing: type.labelLetterSpacing,
        displayTracking: type.displayTracking,
        heroTracking: type.heroTracking,
        displayWordSpacing: type.displayWordSpacing
      })) {
        expect(value, name).toMatch(SPACING);
      }
    });
  });

  it("lists each exception with a reason and a date", () => {
    for (const e of EXCEPTIONS) {
      expect(e.reason.trim()).not.toBe("");
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
