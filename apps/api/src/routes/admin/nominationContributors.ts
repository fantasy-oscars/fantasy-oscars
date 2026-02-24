import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminNominationContributorsAddRoute } from "./nominationContributorsAdd.js";
import { registerAdminNominationContributorsDeleteRoute } from "./nominationContributorsDelete.js";

export function registerAdminNominationContributorRoutes(
  router: Router,
  client: DbClient
): void {
  registerAdminNominationContributorsAddRoute({ router, client });
  registerAdminNominationContributorsDeleteRoute({ router, client });
}
