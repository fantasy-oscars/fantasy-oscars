import type { BrandId } from "@fantasy-oscars/shared/brands";
import type { BrandDefinition } from "./contract";
import { ballot } from "./ballot";
import { festival } from "./festival";
import { lightbox } from "./lightbox";
import { noir } from "./noir";
import { redCarpet } from "./red-carpet";
import { refinedGold } from "./refined-gold";
import { technicolor } from "./technicolor";

/** Brands that have a definition. A brand without one renders as DEFAULT_BRAND. */
export const BRAND_DEFINITIONS: readonly BrandDefinition[] = [
  refinedGold,
  redCarpet,
  ballot,
  noir,
  festival,
  technicolor,
  lightbox
];

export const DEFAULT_BRAND: BrandDefinition = refinedGold;

export function getBrandDefinition(id: BrandId): BrandDefinition {
  return BRAND_DEFINITIONS.find((b) => b.id === id) ?? DEFAULT_BRAND;
}

export * from "./contract";
export { sharedByMode, sharedConstants } from "./shared";
export { generateBrandCss } from "./css";
export * from "./fontCatalog";
