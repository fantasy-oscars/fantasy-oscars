import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminContentDynamicRoutes } from "./contentDynamic.js";

export function registerAdminContentRoutes(router: Router, client: DbClient): void {
  registerAdminContentDynamicRoutes({ router, client });
}
