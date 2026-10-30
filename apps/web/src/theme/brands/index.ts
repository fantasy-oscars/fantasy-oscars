import type { BrandId } from "@fantasy-oscars/shared/brands";
import type { BrandDefinition } from "./contract";
import { refinedGold } from "./refined-gold";

/** Brands that have a definition. A brand without one renders as DEFAULT_BRAND. */
export const BRAND_DEFINITIONS: readonly BrandDefinition[] = [refinedGold];

export const DEFAULT_BRAND: BrandDefinition = refinedGold;

export function getBrandDefinition(id: BrandId): BrandDefinition {
  return BRAND_DEFINITIONS.find((b) => b.id === id) ?? DEFAULT_BRAND;
}

export * from "./contract";
export { sharedByMode, sharedConstants } from "./shared";
export { generateBrandCss } from "./css";
