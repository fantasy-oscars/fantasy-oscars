import type { MantineColorSchemeManager } from "@ui";
import type { BrandId } from "@fantasy-oscars/shared/brands";
import { parseTestAppearance, testAppearanceTarget } from "../../decisions/brand";
import { TEST_APPEARANCE_KEY } from "./storage";

function isBase(value: string | null | undefined): value is "light" | "dark" {
  return value === "light" || value === "dark";
}

/**
 * Mantine's colour scheme manager, with nothing persisted: the theme and mode
 * come from the draw, not from a stored toggle. `get` reads the attribute the
 * pre-paint script set; `set` and `clear` do nothing, so Mantine stops writing
 * `mantine-color-scheme-value` and that key stays meaningful as "a person chose
 * this before" (read once at first login).
 *
 * In test builds (`testOverride`), `subscribe` listens for `storage` events on
 * `fo:test-appearance` so the assertion tier can repaint a loaded page in place.
 */
export function createColorSchemeManager(options: {
  testOverride: boolean;
  enabled: readonly BrandId[];
}): MantineColorSchemeManager {
  let listener: ((event: StorageEvent) => void) | null = null;
  return {
    get: (defaultValue) => {
      if (typeof document === "undefined") return defaultValue;
      const attribute = document.documentElement.getAttribute(
        "data-mantine-color-scheme"
      );
      return isBase(attribute) ? attribute : defaultValue;
    },
    set: () => undefined,
    clear: () => undefined,
    subscribe: (onUpdate) => {
      if (!options.testOverride || typeof window === "undefined") return;
      listener = (event) => {
        if (
          event.storageArea !== window.localStorage ||
          event.key !== TEST_APPEARANCE_KEY
        ) {
          return;
        }
        const override = parseTestAppearance(event.newValue, options.enabled);
        if (!override) return;
        const { brand, base } = testAppearanceTarget(override);
        document.documentElement.dataset.brand = brand;
        onUpdate(base);
      };
      window.addEventListener("storage", listener);
    },
    unsubscribe: () => {
      if (listener && typeof window !== "undefined") {
        window.removeEventListener("storage", listener);
      }
      listener = null;
    }
  };
}
