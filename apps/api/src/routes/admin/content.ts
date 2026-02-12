import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminContentDynamicRoutes } from "./contentDynamic.js";
import { registerAdminContentStaticRoutes } from "./contentStatic.js";

export function registerAdminContentRoutes(router: Router, client: DbClient): void {
  registerAdminContentStaticRoutes({ router, client });
  registerAdminContentDynamicRoutes({ router, client });
}
