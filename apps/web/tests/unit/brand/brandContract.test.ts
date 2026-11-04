import fs from "node:fs";
import path from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { BRAND_IDS, isBrandId } from "@fantasy-oscars/shared/brands";
import {
  BRAND_DEFINITIONS,
  BUTTON_SHAPES,
  COLOR_SLOTS,
  DECORATIONS,
  DEFAULT_BRAND,
  MODES,
  NAV_ACTIVE_COLORS,
  NAV_TREATMENTS,
  RULE_STYLES,
  SHADOW_SLOTS,
  TEXT_CASES,
  TWO_TONE_METHODS,
  WORDMARK_TONE_COLORS,
  generateBrandCss,
  sharedByMode,
  sharedConstants,
  type BrandDefinition,
  type ColorSlot,
  type ColorSlots,
  type Mode
} from "@/theme/brands";
import { colorChannels, kebab } from "@/theme/brands/css";

const SRC = path.resolve(__dirname, "../../../src");

describe("brand contract (types)", () => {
  it("requires every colour slot and both modes at the type level", () => {
    expectTypeOf<keyof ColorSlots>().toEqualTypeOf<ColorSlot>();
    expectTypeOf<keyof BrandDefinition["modes"]>().toEqualTypeOf<Mode>();
  });
});

describe.each(BRAND_DEFINITIONS.map((b) => [b.id, b] as const))(
  "brand definition %s",
  (_id, brand) => {
    it("uses a known brand id and home layout", () => {
      expect(isBrandId(brand.id)).toBe(true);
      expect(isBrandId(brand.homeLayout)).toBe(true);
    });

    it.each(MODES)("fills every colour and shadow slot in %s mode", (mode) => {
      const { colors, shadows } = brand.modes[mode];
      expect(Object.keys(colors).sort()).toEqual([...COLOR_SLOTS].sort());
      for (const slot of COLOR_SLOTS) {
        expect(() => colorChannels(colors[slot])).not.toThrow();
      }
      expect(Object.keys(shadows).sort()).toEqual([...SHADOW_SLOTS].sort());
      for (const slot of SHADOW_SLOTS) {
        expect(shadows[slot].trim()).not.toBe("");
      }
    });

    it("fills every type, wordmark, shape and navigation slot", () => {
      for (const group of [brand.type, brand.wordmark, brand.shape, brand.navigation]) {
        for (const [key, value] of Object.entries(group)) {
          expect(value, key).toEqual(expect.any(String));
          expect((value as string).trim(), key).not.toBe("");
        }
      }
      expect(TEXT_CASES).toContain(brand.type.labelCase);
      expect(TEXT_CASES).toContain(brand.type.displayCase);
      expect(TEXT_CASES).toContain(brand.wordmark.case);
      expect(TEXT_CASES).toContain(brand.navigation.case);
      expect(TWO_TONE_METHODS).toContain(brand.wordmark.twoTone);
      expect(BUTTON_SHAPES).toContain(brand.shape.buttonShape);
      expect(RULE_STYLES).toContain(brand.shape.ruleStyle);
      expect(NAV_TREATMENTS).toContain(brand.navigation.activeTab);
      expect(NAV_ACTIVE_COLORS).toContain(brand.navigation.activeColor);
      expect(WORDMARK_TONE_COLORS).toContain(brand.wordmark.toneColor);
    });

    it("gives pill navigation an indicator whose on-colour passes 4.5", () => {
      if (brand.navigation.activeTab !== "pill") return;
      expect(["text", "primary", "accent"]).toContain(brand.navigation.activeColor);
    });

    it("sets every decoration to a boolean", () => {
      expect(Object.keys(brand.decorations).sort()).toEqual([...DECORATIONS].sort());
      for (const d of DECORATIONS) expect(typeof brand.decorations[d]).toBe("boolean");
    });
  }
);

function luminance(value: string): number {
  const [r, g, b] = colorChannels(value)
    .split(",")
    .map((c) => {
      const v = Number(c) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(BRAND_DEFINITIONS.map((b) => [b.id, b] as const))(
  "brand contrast floors %s",
  (_id, brand) => {
    describe.each(MODES)("%s", (mode) => {
      const { colors } = brand.modes[mode];

      it("keeps text, muted and link readable on every background", () => {
        for (const bg of [colors.page, colors.surface, colors.raised, colors.sunken]) {
          expect(contrast(colors.text, bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(colors.muted, bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(colors.link, bg)).toBeGreaterThanOrEqual(4.5);
        }
      });

      it("draws input and hover boundaries (ruleStrong) at 3:1", () => {
        for (const bg of [colors.page, colors.surface, colors.raised, colors.sunken]) {
          expect(contrast(colors.ruleStrong, bg)).toBeGreaterThanOrEqual(3);
        }
      });

      it("keeps the hover well (sunken) distinguishable from page and raised", () => {
        expect(contrast(colors.sunken, colors.raised)).toBeGreaterThanOrEqual(1.07);
        expect(contrast(colors.sunken, colors.page)).toBeGreaterThanOrEqual(1.07);
      });

      it("keeps the action label readable on the primary fill", () => {
        expect(contrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
);

describe("brand registry", () => {
  it("has unique ids from the shared brand list and a default among them", () => {
    const ids = BRAND_DEFINITIONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(BRAND_IDS).toContain(id);
    expect(ids).toContain(DEFAULT_BRAND.id);
  });

  it("keeps refined-gold as the default brand", () => {
    expect(DEFAULT_BRAND.id).toBe("refined-gold");
  });
});

/** The §3.2 table of the component-treatments prescription, one row per brand. */
const DERIVED: Record<string, Record<string, string>> = {
  "refined-gold": {
    "--brand-nav-pill": "0",
    "--brand-nav-indicator": "var(--brand-accent)",
    "--brand-nav-active-bg": "transparent",
    "--brand-nav-active-fg": "var(--brand-text)",
    "--brand-nav-active-border": "var(--brand-accent)",
    "--brand-nav-border-width": "0 0 2px",
    "--brand-nav-letter-spacing": "normal",
    "--brand-section-rule": "var(--brand-border-width) solid var(--brand-rule)",
    "--brand-nav-rule": "var(--brand-section-rule)",
    "--brand-wordmark-tone-color": "var(--brand-accent)",
    "--brand-wordmark-tone-style": "normal",
    "--brand-wordmark-tone-weight": "inherit",
    "--brand-wordmark-stop-display": "none",
    "--brand-wordmark-stop-color": "var(--brand-accent)"
  },
  "red-carpet": {
    "--brand-nav-pill": "0",
    "--brand-nav-indicator": "var(--fo-win-gold-text)",
    "--brand-nav-active-bg": "transparent",
    "--brand-nav-active-fg": "var(--brand-text)",
    "--brand-nav-active-border": "var(--fo-win-gold-text)",
    "--brand-nav-border-width": "0 0 2px",
    "--brand-nav-letter-spacing": "0.12em",
    "--brand-section-rule": "var(--brand-border-width) solid var(--brand-rule)",
    "--brand-nav-rule": "var(--brand-section-rule)",
    "--brand-wordmark-tone-color": "var(--fo-win-gold-text)",
    "--brand-wordmark-tone-style": "normal",
    "--brand-wordmark-tone-weight": "inherit",
    "--brand-wordmark-stop-display": "none",
    "--brand-wordmark-stop-color": "var(--fo-win-gold-text)"
  },
  ballot: {
    "--brand-nav-pill": "0",
    "--brand-nav-indicator": "var(--fo-win-gold-text)",
    "--brand-nav-active-bg": "transparent",
    "--brand-nav-active-fg": "var(--brand-text)",
    "--brand-nav-active-border": "var(--fo-win-gold-text)",
    "--brand-nav-border-width": "0 0 2px",
    "--brand-nav-letter-spacing": "0.08em",
    "--brand-section-rule": "3px double var(--brand-text)",
    "--brand-nav-rule": "var(--brand-section-rule)",
    "--brand-wordmark-tone-color": "inherit",
    "--brand-wordmark-tone-style": "italic",
    "--brand-wordmark-tone-weight": "400",
    "--brand-wordmark-stop-display": "none",
    "--brand-wordmark-stop-color": "var(--brand-accent)"
  },
  noir: {
    "--brand-nav-pill": "0",
    "--brand-nav-indicator": "var(--brand-text)",
    "--brand-nav-active-bg": "transparent",
    "--brand-nav-active-fg": "var(--brand-text)",
    "--brand-nav-active-border": "var(--brand-text)",
    "--brand-nav-border-width": "0 0 2px",
    "--brand-nav-letter-spacing": "0.12em",
    "--brand-section-rule": "var(--brand-border-width) solid var(--brand-rule)",
    "--brand-nav-rule": "var(--brand-section-rule)",
    "--brand-wordmark-tone-color": "var(--fo-win-gold-text)",
    "--brand-wordmark-tone-style": "normal",
    "--brand-wordmark-tone-weight": "inherit",
    "--brand-wordmark-stop-display": "none",
    "--brand-wordmark-stop-color": "var(--fo-win-gold-text)"
  },
  festival: {
    "--brand-nav-pill": "1",
    "--brand-nav-indicator": "var(--brand-text)",
    "--brand-nav-active-bg": "var(--brand-text)",
    "--brand-nav-active-fg": "var(--brand-page)",
    "--brand-nav-active-border": "var(--brand-text)",
    "--brand-nav-border-width": "var(--brand-border-width)",
    "--brand-nav-letter-spacing": "normal",
    "--brand-section-rule": "var(--brand-border-width) solid var(--brand-rule)",
    "--brand-nav-rule": "0 solid transparent",
    "--brand-wordmark-tone-color": "inherit",
    "--brand-wordmark-tone-style": "normal",
    "--brand-wordmark-tone-weight": "inherit",
    "--brand-wordmark-stop-display": "inline",
    "--brand-wordmark-stop-color": "var(--fo-win-gold-text)"
  },
  technicolor: {
    "--brand-nav-pill": "1",
    "--brand-nav-indicator": "var(--brand-primary)",
    "--brand-nav-active-bg": "var(--brand-primary)",
    "--brand-nav-active-fg": "var(--brand-on-primary)",
    "--brand-nav-active-border": "var(--brand-text)",
    "--brand-nav-border-width": "var(--brand-border-width)",
    "--brand-nav-letter-spacing": "normal",
    "--brand-section-rule": "var(--brand-border-width) solid var(--brand-rule)",
    "--brand-nav-rule": "0 solid transparent",
    "--brand-wordmark-tone-color": "var(--brand-accent)",
    "--brand-wordmark-tone-style": "normal",
    "--brand-wordmark-tone-weight": "inherit",
    "--brand-wordmark-stop-display": "none",
    "--brand-wordmark-stop-color": "var(--brand-accent)"
  },
  lightbox: {
    "--brand-nav-pill": "0",
    "--brand-nav-indicator": "var(--brand-accent)",
    "--brand-nav-active-bg": "transparent",
    "--brand-nav-active-fg": "var(--brand-text)",
    "--brand-nav-active-border": "var(--brand-accent)",
    "--brand-nav-border-width": "0 0 2px",
    "--brand-nav-letter-spacing": "normal",
    "--brand-section-rule": "var(--brand-border-width) solid var(--brand-text)",
    "--brand-nav-rule": "var(--brand-section-rule)",
    "--brand-wordmark-tone-color": "inherit",
    "--brand-wordmark-tone-style": "normal",
    "--brand-wordmark-tone-weight": "400",
    "--brand-wordmark-stop-display": "none",
    "--brand-wordmark-stop-color": "var(--brand-accent)"
  }
};

describe("generated brand CSS", () => {
  const css = generateBrandCss(BRAND_DEFINITIONS, DEFAULT_BRAND);

  // Vitest's snapshot client is not available in this setup, so the stored copy is
  // compared by hand. Refresh it with UPDATE_BRAND_CSS=1 after an intended change.
  it("matches the stored snapshot", () => {
    const file = path.resolve(__dirname, "brands.css.snapshot");
    if (process.env.UPDATE_BRAND_CSS === "1") fs.writeFileSync(file, css);
    expect(css).toBe(fs.readFileSync(file, "utf8"));
  });

  it.each(BRAND_DEFINITIONS.map((b) => [b.id] as const))(
    "derives the chrome properties for %s as the prescription table says",
    (id) => {
      const expected = DERIVED[id]!;
      const common = css
        .split("\n\n")
        .find((b) => b.startsWith(`:root[data-brand="${id}"] {`))!;
      const declared = Object.fromEntries(
        [...common.matchAll(/^ {2}(--[\w-]+): (.+);$/gm)].map((m) => [m[1], m[2]])
      );
      for (const [name, value] of Object.entries(expected)) {
        expect(declared[name], name).toBe(value);
      }
      expect(Object.keys(expected)).toHaveLength(14);
    }
  );

  it("is deterministic", () => {
    expect(generateBrandCss(BRAND_DEFINITIONS, DEFAULT_BRAND)).toBe(css);
    expect(generateBrandCss([...BRAND_DEFINITIONS], DEFAULT_BRAND)).toBe(css);
  });

  it("scopes each brand and mirrors the default brand on :root", () => {
    for (const brand of BRAND_DEFINITIONS) {
      expect(css).toContain(`:root[data-brand="${brand.id}"] {`);
      expect(css).toContain(
        `:root[data-brand="${brand.id}"][data-mantine-color-scheme="light"] {`
      );
    }
    const blocks = (selectorPrefix: string) =>
      css
        .split("\n\n")
        .filter((b) => b.startsWith(selectorPrefix))
        // Compare brand slots only; shared --fo-* tokens live in the unscoped blocks.
        .map((b) =>
          b
            .slice(b.indexOf("{"))
            .split("\n")
            .filter((line) => !line.trim().startsWith("--fo-"))
            .join("\n")
            .trim()
        );
    const unscoped = blocks(":root:not(");
    const scoped = blocks(`:root[data-brand="${DEFAULT_BRAND.id}"]:not(`);
    expect(unscoped).toHaveLength(1);
    expect(unscoped).toEqual(scoped);
    const light = blocks(':root[data-mantine-color-scheme="light"]');
    expect(light).toEqual(
      blocks(`:root[data-brand="${DEFAULT_BRAND.id}"][data-mantine-color-scheme="light"]`)
    );
  });

  it("defines every slot for every mode, with rgb channels for colours", () => {
    for (const mode of MODES) {
      const { colors } = DEFAULT_BRAND.modes[mode];
      for (const slot of COLOR_SLOTS) {
        const name = `--brand-${mode}-${kebab(slot)}`;
        expect(css).toContain(`  ${name}: ${colors[slot]};`);
        expect(css).toContain(`  ${name}-rgb: ${colorChannels(colors[slot])};`);
      }
    }
  });

  it("emits the shared tokens once", () => {
    for (const name of Object.keys(sharedConstants)) {
      expect(css.split(`  ${name}:`).length - 1).toBe(1);
    }
    for (const mode of MODES) {
      for (const [name, value] of Object.entries(sharedByMode[mode])) {
        expect(css).toContain(`  ${name}: ${value};`);
      }
    }
    expect(Object.keys(sharedByMode.light)).toEqual(Object.keys(sharedByMode.dark));
  });

  it("defines every --brand-* variable the app reads", () => {
    const defined = new Set([...css.matchAll(/^ {2}(--[\w-]+):/gm)].map((m) => m[1]));
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(css|ts|tsx)$/.test(entry.name) && !p.includes("theme/brands")) {
          for (const m of fs.readFileSync(p, "utf8").matchAll(/var\((--brand-[\w-]+)/g)) {
            used.add(m[1]!);
          }
        }
      }
    };
    walk(SRC);
    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });
});
