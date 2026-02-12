import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminCategoryEditionsDeleteRoute } from "./categoryEditionsDelete.js";
import { registerAdminCategoryEditionsUpdateRoute } from "./categoryEditionsUpdate.js";
import { registerAdminCeremonyCategoriesAddRoute } from "./ceremonyCategoriesAdd.js";
import { registerAdminCeremonyCategoriesCloneRoute } from "./ceremonyCategoriesClone.js";
import { registerAdminCeremonyCategoriesListRoute } from "./ceremonyCategoriesList.js";
import { registerAdminCeremonyCategoriesReorderRoute } from "./ceremonyCategoriesReorder.js";

export function registerAdminCeremonyCategoryRoutes(router: Router, client: DbClient) {
  registerAdminCeremonyCategoriesListRoute({ router, client });
  registerAdminCeremonyCategoriesCloneRoute({ router, client });
  registerAdminCeremonyCategoriesAddRoute({ router, client });
  registerAdminCeremonyCategoriesReorderRoute({ router, client });
  registerAdminCategoryEditionsUpdateRoute({ router, client });
  registerAdminCategoryEditionsDeleteRoute({ router, client });
}
