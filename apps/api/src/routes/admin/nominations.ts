import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminNominationChangeRoute } from "./nominationsChange.js";
import { registerAdminNominationCreateRoute } from "./nominationsCreate.js";
import { registerAdminNominationDeleteRoute } from "./nominationsDelete.js";
import { registerAdminNominationListRoute } from "./nominationsList.js";
import { registerAdminNominationReorderRoute } from "./nominationsReorder.js";

export function registerAdminNominationRoutes(router: Router, client: DbClient) {
  registerAdminNominationListRoute({ router, client });
  registerAdminNominationCreateRoute({ router, client });
  registerAdminNominationReorderRoute({ router, client });
  registerAdminNominationChangeRoute({ router, client });
  registerAdminNominationDeleteRoute({ router, client });
}
