import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminPeopleListRoute } from "./peopleList.js";
import { registerAdminPeopleTmdbSearchRoute } from "./peopleTmdbSearch.js";
import { registerAdminPeopleUpdateRoute } from "./peopleUpdate.js";

export function registerAdminPeopleRoutes(router: Router, client: DbClient): void {
  registerAdminPeopleListRoute({ router, client });
  registerAdminPeopleTmdbSearchRoute({ router, client });
  registerAdminPeopleUpdateRoute({ router, client });
}
