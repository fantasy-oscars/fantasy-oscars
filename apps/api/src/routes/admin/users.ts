import type { Router } from "express";
import { requireSuperAdmin } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { registerAdminUsersGetRoute } from "./usersGet.js";
import { registerAdminUsersListRoute } from "./usersList.js";
import { registerAdminUsersUpdateRoute } from "./usersUpdate.js";
import { registerAdminUsersDeleteRoute } from "./usersDelete.js";

export function registerAdminUserRoutes(router: Router, client: DbClient): void {
  router.use("/users", requireSuperAdmin());
  registerAdminUsersListRoute({ router, client });
  registerAdminUsersGetRoute({ router, client });
  registerAdminUsersUpdateRoute({ router, client });
  registerAdminUsersDeleteRoute({ router, client });
}
