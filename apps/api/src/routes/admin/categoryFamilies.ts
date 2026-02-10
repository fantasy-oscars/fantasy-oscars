import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminCategoryFamiliesCreateRoute } from "./categoryFamiliesCreate.js";
import { registerAdminCategoryFamiliesDeleteRoute } from "./categoryFamiliesDelete.js";
import { registerAdminCategoryFamiliesListRoute } from "./categoryFamiliesList.js";
import { registerAdminCategoryFamiliesUpdateRoute } from "./categoryFamiliesUpdate.js";

export function registerAdminCategoryFamilyRoutes(
  router: Router,
  client: DbClient
): void {
  registerAdminCategoryFamiliesListRoute({ router, client });
  registerAdminCategoryFamiliesCreateRoute({ router, client });
  registerAdminCategoryFamiliesUpdateRoute({ router, client });
  registerAdminCategoryFamiliesDeleteRoute({ router, client });
}
