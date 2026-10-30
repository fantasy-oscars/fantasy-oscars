import { localDateTimeFromDate } from "@fantasy-oscars/shared/brands";
import { resolvePrepaintBrand } from "../../decisions/brand";
import {
  getAnonymousId,
  loadBrandPin,
  loadLastBrand,
  loadLocalBrandPreference
} from "./storage";

/**
 * Sets `data-brand` on the root element before the app renders, so the first
 * paint already uses the right brand. Built as a standalone script (see
 * vite/brandInit.ts) and loaded from index.html; the same decision and storage
 * code as the app is used, so the two cannot drift.
 */
export function applyPrepaintBrand(root: HTMLElement, now: Date): string | undefined {
  try {
    const brand = resolvePrepaintBrand({
      pin: loadBrandPin(),
      last: loadLastBrand(),
      localPreference: loadLocalBrandPreference(),
      anonId: getAnonymousId(),
      now: localDateTimeFromDate(now)
    });
    root.dataset.brand = brand;
    return brand;
  } catch {
    // Leave the attribute unset; the default brand renders.
    return undefined;
  }
}

/** Font preload urls per brand id; `*` holds the default brand's. Filled in at build time. */
export type FontPreloadMap = Record<string, readonly string[]>;

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
    const urls = (brand ? map[brand] : undefined) ?? map["*"] ?? [];
    for (const href of urls) {
      const link = doc.createElement("link");
      link.rel = "preload";
      link.as = "font";
      link.type = "font/woff2";
      link.crossOrigin = "anonymous";
      link.href = href;
      doc.head.appendChild(link);
    }
  } catch {
    // Preloading is an optimisation only.
  }
}
