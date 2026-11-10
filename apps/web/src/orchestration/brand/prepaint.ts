import { localDateTimeFromDate, type BrandId } from "@fantasy-oscars/shared/brands";
import { resolvePrepaintAppearance } from "../../decisions/brand";
import { loadStoredAppearance, type loadTestAppearance } from "./storage";

/**
 * Sets `data-brand` and `data-mantine-color-scheme` on the root element before
 * the app renders, so the first paint already uses the right theme and mode.
 * Built as a standalone script (see vite/brandInit.ts) and loaded from
 * index.html; the same decision and storage code as the app is used, so the two
 * cannot drift. `readTestOverride` is given only in test builds.
 */
export function applyPrepaintAppearance(
  root: HTMLElement,
  now: Date,
  enabled: readonly BrandId[],
  readTestOverride?: typeof loadTestAppearance
): string | undefined {
  try {
    const { brand, base } = resolvePrepaintAppearance({
      stored: loadStoredAppearance({ enabled, readTestOverride }),
      now: localDateTimeFromDate(now),
      enabled
    });
    root.dataset.brand = brand;
    root.setAttribute("data-mantine-color-scheme", base);
    return brand;
  } catch {
    // Leave the attributes unset; the default brand renders.
    return undefined;
  }
}

/**
 * Font preload urls, filled in at build time. Each face is listed once in `files`
 * (urls relative to `base`, without `.woff2`); `brands` points at them by index per brand id, and `*`
 * holds the default brand's pair.
 */
export type FontPreloadMap = {
  base: string;
  files: readonly string[];
  brands: Record<string, readonly number[]>;
};

/**
 * Adds `<link rel="preload" as="font">` for the brand's two critical faces so
 * their download starts before the stylesheet is parsed. The urls are the
 * hashed build assets; fonts need `crossorigin` even when same-origin.
 */
export function preloadBrandFonts(
  doc: Document,
  brand: string | undefined,
  map: FontPreloadMap
): void {
  try {
    const faces = (brand ? map.brands[brand] : undefined) ?? map.brands["*"] ?? [];
    for (const face of faces) {
      const link = doc.createElement("link");
      link.rel = "preload";
      link.as = "font";
      link.type = "font/woff2";
      link.crossOrigin = "anonymous";
      link.href = `${map.base}${map.files[face]}.woff2`;
      doc.head.appendChild(link);
    }
  } catch {
    // Preloading is an optimisation only.
  }
}
