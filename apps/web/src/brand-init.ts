// Entry of the standalone pre-paint script (served as /brand-init.js). It must
// stay tiny and free of React and UI imports.
import { applyPrepaintBrand } from "./orchestration/brand/prepaint";

applyPrepaintBrand(document.documentElement, new Date());
