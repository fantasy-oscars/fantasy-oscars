import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminPeopleListRoute } from "./peopleList.js";
import { registerAdminPeopleUpdateRoute } from "./peopleUpdate.js";

export function registerAdminPeopleRoutes(router: Router, client: DbClient): void {
  registerAdminPeopleListRoute({ router, client });
  registerAdminPeopleUpdateRoute({ router, client });
}
