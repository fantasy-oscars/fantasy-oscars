// Entry of the standalone pre-paint script (served as /brand-init.js). It must
// stay tiny and free of React and UI imports.
import { enabledBrandIds } from "./decisions/brand";
import {
  applyPrepaintAppearance,
  preloadBrandFonts,
  type FontPreloadMap
} from "./orchestration/brand/prepaint";
import { loadTestAppearance } from "./orchestration/brand/storage";

// Replaced at build time (vite/brandInit.ts) with the hashed font urls per brand.
declare const __FO_FONT_PRELOADS__: FontPreloadMap;

// Replaced at build time: true only in test builds that enable every brand.
declare const __FO_ENABLE_ALL_BRANDS__: boolean;

const brand = applyPrepaintAppearance(
  document.documentElement,
  new Date(),
  enabledBrandIds(__FO_ENABLE_ALL_BRANDS__),
  __FO_ENABLE_ALL_BRANDS__ ? loadTestAppearance : undefined
);
preloadBrandFonts(document, brand, __FO_FONT_PRELOADS__);
