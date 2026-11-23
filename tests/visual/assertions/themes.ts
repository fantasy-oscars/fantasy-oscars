import type { BrandDefinition } from "../../../apps/web/src/theme/brands";
import { getBrandDefinition } from "../../../apps/web/src/theme/brands";
import { BRANDS, modesOf, type Brand, type Mode } from "../matrix";

/**
 * A theme is one brand in one mode: the unit the contrast rule, the geometry limits and
 * the specimen backstop iterate. A brand offering both modes is two themes; a brand that
 * offers one (a mode from the brand catalog) is one.
 */
export type Theme = {
  /** `slug/mode`, as failures name it. */
  id: string;
  brand: Brand;
  definition: BrandDefinition;
  mode: Mode;
};

export const THEMES: readonly Theme[] = BRANDS.flatMap((brand) =>
  modesOf(brand).map((mode) => ({
    id: `${brand.slug}/${mode}`,
    brand,
    definition: getBrandDefinition(brand.slug),
    mode
  }))
);
