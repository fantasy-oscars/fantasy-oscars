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
  NAV_TREATMENTS,
  RULE_STYLES,
  SHADOW_SLOTS,
  TEXT_CASES,
  TWO_TONE_METHODS,
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
      expect(TEXT_CASES).toContain(brand.wordmark.case);
      expect(TEXT_CASES).toContain(brand.navigation.case);
      expect(TWO_TONE_METHODS).toContain(brand.wordmark.twoTone);
      expect(BUTTON_SHAPES).toContain(brand.shape.buttonShape);
      expect(RULE_STYLES).toContain(brand.shape.ruleStyle);
      expect(NAV_TREATMENTS).toContain(brand.navigation.activeTab);
    });

    it("sets every decoration to a boolean", () => {
      expect(Object.keys(brand.decorations).sort()).toEqual([...DECORATIONS].sort());
      for (const d of DECORATIONS) expect(typeof brand.decorations[d]).toBe("boolean");
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

describe("generated brand CSS", () => {
  const css = generateBrandCss(BRAND_DEFINITIONS, DEFAULT_BRAND);

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
