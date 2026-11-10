import type { BrandId } from "@fantasy-oscars/shared/brands";
import { enabledBrandIds } from "../../decisions/brand";

/**
 * Test builds set VITE_FO_ENABLE_ALL_BRANDS=1 to exercise unreleased brands and
 * to honour `fo:test-appearance`. The flag is ignored in a production-mode build
 * (the build also refuses it, see vite/brandInit.ts). `import.meta.env.PROD` is
 * true in every `vite build`, so the gate is the build mode: the visual suite
 * builds with `--mode visual`.
 */
export function isTestBuild(): boolean {
  return (
    import.meta.env.MODE !== "production" &&
    import.meta.env.VITE_FO_ENABLE_ALL_BRANDS === "1"
  );
}

/** The released brands, or every brand in a test build. */
export function buildEnabledBrands(): readonly BrandId[] {
  return enabledBrandIds(isTestBuild());
}
