import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminIconsCreateRoute } from "./iconsCreate.js";
import { registerAdminIconsListRoute } from "./iconsList.js";

export function registerAdminIconRoutes(router: Router, client: DbClient): void {
  registerAdminIconsListRoute({ router, client });
  registerAdminIconsCreateRoute({ router, client });
}
