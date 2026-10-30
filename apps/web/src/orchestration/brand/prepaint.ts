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
export function applyPrepaintBrand(root: HTMLElement, now: Date): void {
  try {
    const brand = resolvePrepaintBrand({
      pin: loadBrandPin(),
      last: loadLastBrand(),
      localPreference: loadLocalBrandPreference(),
      anonId: getAnonymousId(),
      now: localDateTimeFromDate(now)
    });
    root.dataset.brand = brand;
  } catch {
    // Leave the attribute unset; the default brand renders.
  }
}
