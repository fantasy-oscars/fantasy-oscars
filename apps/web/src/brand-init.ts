// Entry of the standalone pre-paint script (served as /brand-init.js). It must
// stay tiny and free of React and UI imports.
import {
  applyPrepaintBrand,
  preloadBrandFonts,
  type FontPreloadMap
} from "./orchestration/brand/prepaint";

// Replaced at build time (vite/brandInit.ts) with the hashed font urls per brand.
declare const __FO_FONT_PRELOADS__: FontPreloadMap;

const brand = applyPrepaintBrand(document.documentElement, new Date());
preloadBrandFonts(document, brand, __FO_FONT_PRELOADS__);
