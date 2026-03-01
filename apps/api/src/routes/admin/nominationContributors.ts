import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminNominationContributorsAddRoute } from "./nominationContributorsAdd.js";
import { registerAdminNominationContributorsDeleteRoute } from "./nominationContributorsDelete.js";
import { registerAdminNominationContributorsUpdateRoute } from "./nominationContributorsUpdate.js";

export function registerAdminNominationContributorRoutes(
  router: Router,
  client: DbClient
): void {
  registerAdminNominationContributorsAddRoute({ router, client });
  registerAdminNominationContributorsUpdateRoute({ router, client });
  registerAdminNominationContributorsDeleteRoute({ router, client });
}
