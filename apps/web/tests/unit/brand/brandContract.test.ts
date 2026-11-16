import fs from "node:fs";
import path from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { BRAND_IDS, isBrandId } from "@fantasy-oscars/shared/brands";
import {
  ACCENT_STYLES,
  ASIDE_HEADINGS,
  BRAND_DEFINITIONS,
  BUTTON_SHAPES,
  COLOR_SLOTS,
  CTA_PLACEMENTS,
  CTA_SURFACES,
  DECORATIONS,
  DEFAULT_BRAND,
  HERO_ALIGNS,
  HERO_FIT_RANGE,
  HERO_SURFACES,
  HERO_TONE_COLORS,
  HERO_TONE_STYLES,
  HOME_PLACEMENTS,
  HOME_REGIONS,
  MODES,
  NAV_ACTIVE_COLORS,
  NAV_TREATMENTS,
  ROOM_WORK_FONTS,
  RULE_STYLES,
  SHADOW_SLOTS,
  TEXT_CASES,
  TWO_TONE_METHODS,
  UPDATE_RULES,
  WORDMARK_TONE_COLORS,
  generateBrandCss,
  sharedByMode,
  sharedConstants,
  type BrandDefinition,
  type ColorSlot,
  type ColorSlots,
  type Mode
} from "@/theme/brands";
import {
  ASIDE_EYEBROW_MIN_CONTRAST,
  HERO_TONE_MIN_CONTRAST,
  bandEdgeColor,
  colorChannels,
  heroAccentColor,
  heroToneColor,
  kebab,
  pickTabEdge,
  roomTabRing,
  shadowRingColor
} from "@/theme/brands/css";
import {
  ROOM_TAB_MAX_EDGE_PX,
  ROOM_COMMON_PROPERTIES,
  ROOM_MODE_PROPERTIES,
  roomCssViolations,
  roomTabLowestEdge,
  roomViolations,
  tabEdgeViolations
} from "./roomChecks";
import { stressBrand } from "../../../../../tests/visual/fixtures/stressBrand";

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
    it("uses a known brand id", () => {
      expect(isBrandId(brand.id)).toBe(true);
    });

    it("fills every Home slot with an allowed value", () => {
      const { home } = brand;
      expect(Object.keys(home).sort()).toEqual(
        [
          "asideHeading",
          "ctaPlacement",
          "ctaSurface",
          "heroAlign",
          "heroFit",
          "heroMax",
          "heroSurface",
          "heroTone",
          "placement",
          "regions",
          "updateRule"
        ].sort()
      );
      expect(Object.keys(home.heroTone).sort()).toEqual(["color", "style"]);
      expect(HOME_PLACEMENTS).toContain(home.placement);
      expect(HERO_SURFACES).toContain(home.heroSurface);
      expect(HERO_ALIGNS).toContain(home.heroAlign);
      expect(HOME_REGIONS).toContain(home.regions);
      expect(CTA_SURFACES).toContain(home.ctaSurface);
      expect(CTA_PLACEMENTS).toContain(home.ctaPlacement);
      expect(UPDATE_RULES).toContain(home.updateRule);
      expect(HERO_TONE_COLORS).toContain(home.heroTone.color);
      expect(HERO_TONE_STYLES).toContain(home.heroTone.style);
      expect(ASIDE_HEADINGS).toContain(home.asideHeading);
      expect(ACCENT_STYLES).toContain(brand.type.accentStyle);
      expect(home.heroMax).toMatch(/^\d+px$/);
      expect(home.heroFit).toBeGreaterThanOrEqual(HERO_FIT_RANGE.min);
      expect(home.heroFit).toBeLessThanOrEqual(HERO_FIT_RANGE.max);
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

/** Mixes `fg` at `alpha` over `bg`, as `rgba(fg, alpha)` paints over an opaque background. */
function mix(fg: string, bg: string, alpha: number): string {
  const f = colorChannels(fg).split(",").map(Number);
  const b = colorChannels(bg).split(",").map(Number);
  const [r, g, bl] = f.map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)));
  return `rgb(${r}, ${g}, ${bl})`;
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

describe.each(BRAND_DEFINITIONS.map((b) => [b.id, b] as const))(
  "Home hero contrast %s",
  (_id, brand) => {
    const dark = brand.modes.dark.colors;
    const light = brand.modes.light.colors;

    it("keeps dark text and muted readable on the dark panel", () => {
      if (brand.home.heroSurface !== "darkPanel") return;
      expect(contrast(dark.text, dark.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark.muted, dark.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the pressed Home call-to-action label readable on its fill", () => {
      if (brand.home.ctaSurface !== "primary") return;
      for (const colors of [dark, light]) {
        // Mirrors --brand-home-cta-button-active: on-primary 80% over primary, label in primary.
        expect(
          contrast(colors.primary, mix(colors.onPrimary, colors.primary, 0.8))
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("keeps the hero wordmark's tone colour at 3:1 on a panel, or drops it", () => {
      if (brand.home.heroSurface === "open") return;
      const panel = brand.home.heroSurface === "darkPanel" ? dark.surface : light.accent;
      const tone = heroToneColor(brand);
      if (tone === "inherit") {
        for (const mode of MODES) {
          const value =
            brand.wordmark.toneColor === "gold"
              ? sharedByMode[mode]["--fo-win-gold-text"]
              : brand.modes[mode].colors[brand.wordmark.toneColor];
          expect(contrast(value, panel)).toBeLessThan(HERO_TONE_MIN_CONTRAST);
        }
        return;
      }
      const match = /^var\(--brand-(light|dark)-([\w-]+)\)$/.exec(tone);
      const value = match
        ? brand.modes[match[1] as Mode].colors[brand.wordmark.toneColor as ColorSlot]
        : tone;
      expect(contrast(value, panel)).toBeGreaterThanOrEqual(HERO_TONE_MIN_CONTRAST);
    });

    it("keeps light page and its 0.9 mix readable on the accent panel", () => {
      if (brand.home.heroSurface !== "accentPanel") return;
      expect(contrast(light.page, light.accent)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(mix(light.page, light.accent, 0.9), light.accent)
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
);

/** The hero's painted fill, foreground and muted ink in `mode`, as `--brand-home-hero-*` resolve. */
function heroInks(brand: BrandDefinition, mode: Mode) {
  const { dark, light } = brand.modes;
  const page = brand.modes[mode].colors;
  switch (brand.home.heroSurface) {
    case "darkPanel":
      return { bg: dark.colors.surface, fg: dark.colors.text, muted: dark.colors.muted };
    case "accentPanel":
      return {
        bg: light.colors.accent,
        fg: light.colors.page,
        muted: mix(light.colors.page, light.colors.accent, 0.9)
      };
    case "open":
      return { bg: page.page, fg: page.text, muted: page.muted };
  }
}

/** The band edge is a hairline, not a boundary that must be seen: it only has to read as a line. */
const BAND_EDGE_MIN_CONTRAST = 1.3;

describe.each(BRAND_DEFINITIONS.map((b) => [b.id, b] as const))(
  "Home signature contrast %s",
  (_id, brand) => {
    const { home } = brand;

    describe.each(MODES)("%s", (mode) => {
      const { colors } = brand.modes[mode];
      const hero = heroInks(brand, mode);

      it("draws the band edge as a line apart from both the band and the page", () => {
        if (home.placement !== "band") return;
        const edge = bandEdgeColor(brand, mode);
        expect(contrast(edge, hero.bg)).toBeGreaterThanOrEqual(BAND_EDGE_MIN_CONTRAST);
        expect(contrast(edge, colors.page)).toBeGreaterThanOrEqual(
          BAND_EDGE_MIN_CONTRAST
        );
      });

      it("outlines the create-league card in the hero at 3:1 and keeps its ring visible", () => {
        if (home.ctaPlacement !== "hero") return;
        // --brand-home-cta-hero-edge is the hero muted ink; the ring is the hero foreground.
        expect(contrast(hero.muted, hero.bg)).toBeGreaterThanOrEqual(3);
        expect(contrast(hero.fg, hero.bg)).toBeGreaterThanOrEqual(3);
        // The card's text is the hero muted ink.
        expect(contrast(hero.muted, hero.bg)).toBeGreaterThanOrEqual(4.5);
      });

      it("sets the hero's accent word at 3:1 on the hero, or falls back to the wordmark", () => {
        if (home.heroTone.color !== "accent") return;
        const accent = heroAccentColor(brand);
        expect(accent, "accent word does not reach 3:1; use wordmark").not.toBeNull();
        const value =
          accent === "var(--fo-win-gold-text)"
            ? sharedByMode[mode]["--fo-win-gold-text"]
            : accent!;
        expect(contrast(value, hero.bg)).toBeGreaterThanOrEqual(HERO_TONE_MIN_CONTRAST);
      });

      it("sets the accent rule above the update at 3:1 on the page", () => {
        if (home.updateRule !== "accent") return;
        expect(
          contrast(sharedByMode[mode]["--fo-win-gold-text"], colors.page)
        ).toBeGreaterThanOrEqual(3);
      });

      it("keeps the eyebrow heading at 4.5:1 on the page", () => {
        if (home.asideHeading !== "eyebrow") return;
        const ink =
          contrast(colors.accent, colors.page) >= ASIDE_EYEBROW_MIN_CONTRAST
            ? colors.accent
            : colors.muted;
        expect(contrast(ink, colors.page)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
);

describe("Home signature values", () => {
  const byId = (id: string) => BRAND_DEFINITIONS.find((b) => b.id === id)!;

  it("sets red carpet's header wordmark in the hero's voice", () => {
    const { type, wordmark, home } = byId("red-carpet");
    expect(wordmark).toMatchObject({
      font: type.displayFont,
      weight: type.displayWeight,
      case: type.displayCase,
      letterSpacing: type.heroTracking,
      twoTone: "colourItalic",
      toneColor: "gold"
    });
    // The hero's second word is gold italic too.
    expect(home.heroTone).toEqual({ color: "accent", style: "italic" });
    expect(byId("red-carpet").fonts.faces.map((f) => f.family)).not.toContain("Cinzel");
  });

  it("gives red carpet the band, the card in the band, the accent rule and a gold italic word", () => {
    expect(byId("red-carpet").home).toMatchObject({
      placement: "band",
      ctaPlacement: "hero",
      updateRule: "accent",
      heroTone: { color: "accent", style: "italic" }
    });
  });

  it("gives refined gold the eyebrow heading and technicolor the accent word", () => {
    expect(byId("refined-gold").home.asideHeading).toBe("eyebrow");
    // Gold #e2c25a on the teal panel #0c6e6e measures 3.49:1.
    expect(byId("technicolor").home.heroTone).toEqual({
      color: "accent",
      style: "normal"
    });
    expect(heroAccentColor(byId("technicolor"))).toBe("#e2c25a");
  });

  it("leaves every other brand on the neutral signature values", () => {
    const signed = new Set(["red-carpet", "refined-gold", "technicolor"]);
    for (const brand of BRAND_DEFINITIONS) {
      if (signed.has(brand.id)) continue;
      expect(brand.home, brand.id).toMatchObject({
        ctaPlacement: "aside",
        updateRule: "none",
        heroTone: { color: "wordmark", style: "normal" },
        asideHeading: "title"
      });
      expect(brand.home.placement, brand.id).not.toBe("band");
    }
  });
});

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
    // `colourItalic`: gold italic "Oscars" at the wordmark's own weight, as the hero.
    "--brand-wordmark-tone-style": "italic",
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

  it("derives the Home properties from the Home slots", () => {
    const declared = (id: string) => {
      const common = css
        .split("\n\n")
        .find((b) => b.startsWith(`:root[data-brand="${id}"] {`))!;
      return Object.fromEntries(
        [...common.matchAll(/^ {2}(--[\w-]+): (.+);$/gm)].map((m) => [m[1], m[2]])
      );
    };
    const gold = declared("refined-gold");
    expect(gold["--brand-home-areas"]).toBe('"hero aside" "updates aside"');
    expect(gold["--brand-home-hero-bg"]).toBe("var(--brand-dark-surface)");
    expect(gold["--brand-home-hero-fg"]).toBe("var(--brand-dark-text)");
    expect(gold["--brand-home-hero-radius"]).toBe("var(--brand-radius-lg)");
    expect(gold["--brand-home-hero-max"]).toBe("44px");
    expect(gold["--brand-home-hero-fit"]).toBe("12.5");
    expect(gold["--brand-home-open"]).toBe("0");
    expect(gold["--brand-font-accent"]).toContain("Inter");
    expect(gold["--brand-accent-style"]).toBe("normal");
    const ballot = declared("ballot");
    expect(ballot["--brand-home-hero-bg"]).toBe("transparent");
    expect(ballot["--brand-home-hero-rule"]).toBe("3px double var(--brand-text)");
    expect(declared("noir")["--brand-home-hero-rule"]).toBe(
      "2px solid var(--brand-text)"
    );
    expect(declared("red-carpet")["--brand-home-hero-muted"]).toBe(
      "rgba(var(--brand-light-page-rgb), 0.9)"
    );
    expect(gold).not.toHaveProperty("--brand-home-layout");
  });

  it("gives the hero wordmark a tone colour that reads on the hero surface", () => {
    const declared = (id: string) => {
      const common = css
        .split("\n\n")
        .find((b) => b.startsWith(`:root[data-brand="${id}"] {`))!;
      return Object.fromEntries(
        [...common.matchAll(/^ {2}(--[\w-]+): (.+);$/gm)].map((m) => [m[1], m[2]])
      );
    };
    // [tone colour, stop colour] per brand.
    const expected: Record<string, [string, string]> = {
      "refined-gold": ["var(--brand-dark-accent)", "var(--brand-dark-accent)"],
      noir: ["var(--fo-win-gold-text)", "var(--fo-win-gold-text)"],
      "red-carpet": ["#e2c25a", "#e2c25a"],
      ballot: ["inherit", "var(--brand-accent)"],
      festival: ["inherit", "#e2c25a"],
      // heroTone.color "accent": the second word is gold on the teal panel.
      technicolor: ["#e2c25a", "inherit"],
      lightbox: ["inherit", "var(--brand-dark-accent)"]
    };
    for (const brand of BRAND_DEFINITIONS) {
      const values = declared(brand.id);
      expect(
        [values["--brand-home-hero-tone-color"], values["--brand-home-hero-stop-color"]],
        brand.id
      ).toEqual(expected[brand.id]);
    }
  });

  it("derives the band, hero CTA, update rule, hero tone and eyebrow properties", () => {
    const redCarpet = BRAND_DEFINITIONS.find((b) => b.id === "red-carpet")!;
    const signed: BrandDefinition = {
      ...redCarpet,
      home: {
        ...redCarpet.home,
        placement: "band",
        ctaPlacement: "hero",
        updateRule: "accent",
        heroTone: { color: "accent", style: "italic" },
        asideHeading: "eyebrow"
      }
    };
    const blocks = generateBrandCss([signed], DEFAULT_BRAND).split("\n\n");
    const declared = (selector: string) =>
      Object.fromEntries(
        [
          ...blocks
            .find((b) => b.startsWith(`${selector} {`))!
            .matchAll(/^ {2}(--[\w-]+): (.+);$/gm)
        ].map((m) => [m[1], m[2]])
      );
    const scope = ':root[data-brand="red-carpet"]';
    const common = declared(scope);
    expect(common["--brand-home-areas"]).toBe('"hero hero" "updates aside"');
    expect(common["--brand-home-hero-band"]).toBe("1");
    expect(common["--brand-home-hero-band-fill"]).toContain(
      "var(--brand-home-band-edge)"
    );
    expect(common["--brand-home-hero-radius"]).toBe("0");
    expect(common["--brand-home-hero-shadow"]).toBe("0 0 0 0 transparent");
    expect(common["--brand-home-cta-hero-display"]).toBe("contents");
    expect(common["--brand-home-cta-aside-display"]).toBe("none");
    expect(common["--brand-home-cta-hero-edge"]).toBe(common["--brand-home-hero-muted"]);
    expect(common["--brand-home-update-rule"]).toBe("1px solid var(--fo-win-gold-text)");
    expect(common["--brand-home-update-ruled"]).toBe("1");
    expect(common["--brand-home-hero-tone-color"]).toBe("#e2c25a");
    expect(common["--brand-home-hero-tone-style"]).toBe("italic");
    expect(common["--brand-home-aside-heading-case"]).toBe("uppercase");
    expect(common["--brand-home-aside-heading-font"]).toBe("var(--brand-font-label)");
    expect(common["--brand-home-aside-heading-size"]).toBe("var(--fo-font-size-xs)");
    // Velvet is unreadable on the dark page and readable on the light one.
    expect(declared(`${scope}:not([data-mantine-color-scheme="light"])`)).toMatchObject({
      "--brand-home-band-edge": "#8e2a3a",
      "--brand-home-aside-heading-color": "var(--brand-muted)"
    });
    expect(declared(`${scope}[data-mantine-color-scheme="light"]`)).toMatchObject({
      "--brand-home-band-edge": "#8e2a3a",
      "--brand-home-aside-heading-color": "var(--brand-accent)"
    });
  });

  it("keeps every brand's current Home rendering under the neutral new slots", () => {
    const declared = (id: string) =>
      Object.fromEntries(
        [
          ...css
            .split("\n\n")
            .find((b) => b.startsWith(`:root[data-brand="${id}"] {`))!
            .matchAll(/^ {2}(--[\w-]+): (.+);$/gm)
        ].map((m) => [m[1], m[2]])
      );
    for (const brand of BRAND_DEFINITIONS) {
      if (brand.home.placement === "band") continue;
      const values = declared(brand.id);
      expect(values["--brand-home-hero-band"], brand.id).toBe("0");
      expect(values["--brand-home-hero-band-fill"], brand.id).toBe("none");
      expect(values["--brand-home-hero-shadow"], brand.id).toBe(
        "var(--brand-shadow-hero)"
      );
    }
  });

  it("reads the band edge from the hero shadow's ring, else ruleStrong", () => {
    expect(shadowRingColor("0 0 0 1px #8e2a3a")).toBe("#8e2a3a");
    expect(shadowRingColor("inset 0 0 0 6px #ffffff, 0 0 0 1px #141414")).toBe("#141414");
    expect(
      shadowRingColor("0 1px 2px rgba(60, 45, 10, 0.06), 0 0 0 2px rgba(1, 2, 3, 0.5)")
    ).toBe("rgba(1, 2, 3, 0.5)");
    expect(shadowRingColor("0 0 0 0 transparent")).toBeNull();
    expect(shadowRingColor("0 8px 20px rgba(0, 0, 0, 0.35)")).toBeNull();
    const gold = BRAND_DEFINITIONS.find((b) => b.id === "refined-gold")!;
    expect(bandEdgeColor(gold, "light")).toBe(gold.modes.light.colors.ruleStrong);
    expect(bandEdgeColor(gold, "dark")).toBe("#6b5a2a");
  });

  it("resolves the hero accent ink to a gold that reads on the panel, or null", () => {
    const byId = (id: string) => BRAND_DEFINITIONS.find((b) => b.id === id)!;
    expect(heroAccentColor(byId("ballot"))).toBe("var(--fo-win-gold-text)");
    expect(heroAccentColor(byId("red-carpet"))).toBe("#e2c25a");
    const unreadable: BrandDefinition = {
      ...byId("red-carpet"),
      modes: {
        ...byId("red-carpet").modes,
        light: {
          ...byId("red-carpet").modes.light,
          colors: { ...byId("red-carpet").modes.light.colors, accent: "#c9a640" }
        }
      }
    };
    expect(heroAccentColor(unreadable)).toBeNull();
  });

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

describe("draft room generator", () => {
  const technicolor = BRAND_DEFINITIONS.find((b) => b.id === "technicolor")!;
  const lightbox = BRAND_DEFINITIONS.find((b) => b.id === "lightbox")!;

  it("resolves the tab ring and clamped drop", () => {
    expect(roomTabRing(technicolor.room)).toEqual({ ring: 2, drop: 5 });
    expect(roomTabRing(lightbox.room)).toEqual({ ring: 1, drop: 0 });
    const drop = (ring: 0 | 1 | 2 | 3, dropPx: number) =>
      roomTabRing({
        ...technicolor.room,
        edge: { ...technicolor.room.edge, ring, drop: dropPx }
      }).drop;
    expect(drop(1, 0)).toBe(4);
    expect(drop(3, 6)).toBe(4);
    expect(drop(1, 6)).toBe(6);
    expect(roomTabRing({ ...technicolor.room, tabEdge: "flat" })).toEqual({
      ring: 0,
      drop: 0
    });
  });

  it("picks the tab edge colours the prescription lists for technicolor and lightbox", () => {
    const pick = (b: BrandDefinition, mode: Mode, tone: "primary" | "danger") =>
      pickTabEdge(
        b,
        mode,
        tone === "primary" ? b.modes[mode].colors.primary : sharedConstants["--fo-danger"]
      );
    for (const mode of MODES) {
      expect(pick(technicolor, mode, "primary")).toBe("text");
      expect(pick(technicolor, mode, "danger")).toBe("text");
      expect(pick(lightbox, mode, "primary")).toBe("ruleStrong");
      expect(pick(lightbox, mode, "danger")).toBe("text");
    }
  });

  it("throws, naming brand, mode and tone, when no tab edge colour reaches 3:1", () => {
    const flat = (c: ColorSlots): ColorSlots => ({
      ...c,
      text: c.page,
      ruleStrong: c.page,
      rule: c.page
    });
    const broken: BrandDefinition = {
      ...technicolor,
      modes: {
        ...technicolor.modes,
        light: {
          ...technicolor.modes.light,
          colors: flat(technicolor.modes.light.colors)
        }
      }
    };
    expect(() => generateBrandCss([broken], broken)).toThrow(
      /technicolor.*light.*on-primary/
    );
  });
});

describe.each(BRAND_DEFINITIONS.map((b) => [b.id, b] as const))(
  "draft room contract %s",
  (_id, brand) => {
    it("fills room, shape and fonts with allowed values", () => {
      expect(roomViolations(brand)).toEqual([]);
    });

    it("keeps the tab edge readable on every tone in both modes", () => {
      expect(tabEdgeViolations(brand)).toEqual([]);
    });

    it("keeps the tab's lowest painted edge within the header", () => {
      expect(roomTabLowestEdge(brand)).toBeLessThanOrEqual(ROOM_TAB_MAX_EDGE_PX);
    });

    it("emits every derived room property in each block, and no others", () => {
      const css = generateBrandCss(BRAND_DEFINITIONS, DEFAULT_BRAND);
      expect(roomCssViolations(css, brand)).toEqual([]);
      expect(ROOM_COMMON_PROPERTIES).toHaveLength(12);
      expect(ROOM_MODE_PROPERTIES).toHaveLength(4);
    });
  }
);

describe("draft room checks reject broken definitions", () => {
  const technicolor = BRAND_DEFINITIONS.find((b) => b.id === "technicolor")!;
  const noir = BRAND_DEFINITIONS.find((b) => b.id === "noir")!;
  const withEdge = (
    b: BrandDefinition,
    edge: Partial<BrandDefinition["room"]["edge"]>
  ) => ({
    ...b,
    room: { ...b.room, edge: { ...b.room.edge, ...edge } }
  });

  it("rejects a drop with no ring", () => {
    expect(roomViolations(withEdge(noir, { ring: 0, drop: 3 }))).toEqual([
      expect.stringContaining("drop 3 needs ring of at least 1")
    ]);
  });

  it("rejects a drop above the range and a fractional drop", () => {
    expect(roomViolations(withEdge(technicolor, { drop: 7 }))).toEqual([
      expect.stringContaining("drop 7 is not an integer in 0 to 6")
    ]);
    expect(roomViolations(withEdge(technicolor, { drop: 2.5 }))).toEqual([
      expect.stringContaining("drop 2.5 is not an integer")
    ]);
  });

  it("rejects a work font outside ROOM_WORK_FONTS", () => {
    const broken = { ...noir, room: { ...noir.room, workFont: '"Cinzel", serif' } };
    expect(roomViolations(broken)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('work font "Cinzel" is not in ROOM_WORK_FONTS')
      ])
    );
  });

  it("rejects a display title voice outside ROOM_TITLE_FONTS", () => {
    const broken = {
      ...noir,
      type: { ...noir.type, displayFont: '"Bodoni Moda", serif' }
    };
    expect(roomViolations(broken)).toEqual([
      expect.stringContaining('display font "Bodoni Moda" is not in ROOM_TITLE_FONTS')
    ]);
  });

  it("rejects faces that miss a working weight", () => {
    const broken = {
      ...noir,
      fonts: {
        ...noir.fonts,
        faces: noir.fonts.faces.map((f) =>
          f.family === "Inter" ? { ...f, weights: f.weights.filter((w) => w !== 600) } : f
        )
      }
    };
    expect(roomViolations(broken)).toEqual([
      expect.stringContaining('faces do not declare weight 600 of "Inter"')
    ]);
  });

  it("rejects radii and a border width outside their ranges", () => {
    const broken = {
      ...noir,
      shape: {
        ...noir.shape,
        radiusSm: "13px",
        radiusMd: "21px",
        radiusLg: "29px",
        borderWidth: "3px"
      }
    };
    expect(roomViolations(broken)).toHaveLength(4);
  });

  it("rejects a ring tab whose on-primary edge is 1:1 with the fill", () => {
    const colors = technicolor.modes.light.colors;
    const broken: BrandDefinition = {
      ...technicolor,
      modes: {
        ...technicolor.modes,
        light: {
          ...technicolor.modes.light,
          colors: {
            ...colors,
            primary: colors.text,
            rule: colors.text,
            ruleStrong: colors.text
          }
        }
      }
    };
    expect(tabEdgeViolations(broken)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("(light): no on-primary edge colour")
      ])
    );
  });

  it("rejects a rest edge that merges with the page", () => {
    const colors = technicolor.modes.dark.colors;
    const broken: BrandDefinition = {
      ...technicolor,
      modes: {
        ...technicolor.modes,
        dark: {
          ...technicolor.modes.dark,
          colors: { ...colors, text: colors.page }
        }
      }
    };
    expect(tabEdgeViolations(broken)).toEqual(
      expect.arrayContaining([expect.stringContaining("(dark): rest edge vs page")])
    );
  });

  it("does not hold a brand with no ring tab to the tab edge table", () => {
    expect(noir.room.tabEdge).toBe("double");
    expect(tabEdgeViolations(noir)).toEqual([]);
  });

  it("measures the tab's lowest edge and holds every ring and drop to the header", () => {
    expect(roomTabLowestEdge(withEdge(technicolor, { ring: 3, drop: 6 }))).toBe(61);
    // The generated clamp keeps every legal ring and drop within the limit; this is the
    // guard that fails if the clamp in roomTabRing is loosened.
    for (const ring of [0, 1, 2, 3] as const) {
      for (let drop = 0; drop <= 6; drop++) {
        for (const tabEdge of ["ring", "drop"] as const) {
          const brand = {
            ...withEdge(technicolor, { ring, drop }),
            room: { ...withEdge(technicolor, { ring, drop }).room, tabEdge }
          };
          expect(roomTabLowestEdge(brand)).toBeLessThanOrEqual(ROOM_TAB_MAX_EDGE_PX);
        }
      }
    }
  });

  it("rejects generated CSS missing or adding a room property", () => {
    const css = generateBrandCss(BRAND_DEFINITIONS, DEFAULT_BRAND);
    const header = ':root[data-brand="refined-gold"] {';
    const edit = (change: (block: string) => string) =>
      css
        .split("\n\n")
        .map((b) => (b.startsWith(header) ? change(b) : b))
        .join("\n\n");

    const missing = edit((b) => b.replace(/^ {2}--brand-room-tab-lift: .*\n/m, ""));
    expect(missing).not.toBe(css);
    expect(roomCssViolations(missing, DEFAULT_BRAND)).toEqual([
      'Brand "refined-gold" common: missing --brand-room-tab-lift'
    ]);

    const extra = edit((b) => b.replace(header, `${header}\n  --brand-room-extra: 1;`));
    expect(roomCssViolations(extra, DEFAULT_BRAND)).toEqual([
      'Brand "refined-gold" common: unexpected --brand-room-extra'
    ]);
  });
});

describe("draft room stress definition", () => {
  const withMontserrat = { workFonts: [...ROOM_WORK_FONTS, "Montserrat"] };

  it("passes the room contract with its own work font added", () => {
    expect(roomViolations(stressBrand, withMontserrat)).toEqual([]);
  });

  it("is held to the closed list of work fonts by default", () => {
    expect(roomViolations(stressBrand)).toEqual([
      expect.stringContaining('work font "Montserrat" is not in ROOM_WORK_FONTS')
    ]);
  });

  it("passes the tab edge contrast table", () => {
    expect(tabEdgeViolations(stressBrand)).toEqual([]);
  });

  it("sits at the far edge of every range, with its lowest tab edge at 61 px", () => {
    expect(stressBrand.room.edge).toEqual({
      ring: 3,
      ringColor: "text",
      drop: 6,
      depth: "glow"
    });
    expect(stressBrand.room.tabEdge).toBe("drop");
    expect(stressBrand.shape.radiusSm).toBe("12px");
    expect(stressBrand.shape.radiusMd).toBe("20px");
    expect(stressBrand.shape.borderWidth).toBe("2px");
    expect(stressBrand.shape.ruleStyle).toBe("double");
    expect(roomTabLowestEdge(stressBrand)).toBe(61);
  });

  it("generates every derived room property", () => {
    expect(
      roomCssViolations(generateBrandCss([stressBrand], stressBrand), stressBrand)
    ).toEqual([]);
  });

  it("is not a registered brand", () => {
    expect(BRAND_DEFINITIONS).not.toContain(stressBrand);
  });
});
