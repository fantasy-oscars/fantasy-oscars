import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminUsersGetRoute } from "./usersGet.js";
import { registerAdminUsersListRoute } from "./usersList.js";
import { registerAdminUsersUpdateRoute } from "./usersUpdate.js";

export function registerAdminUserRoutes(router: Router, client: DbClient): void {
  registerAdminUsersListRoute({ router, client });
  registerAdminUsersGetRoute({ router, client });
  registerAdminUsersUpdateRoute({ router, client });
}
