import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminWinnersListRoute } from "./winnersList.js";
import { registerAdminWinnersFinalizeRoute } from "./winnersFinalize.js";
import { registerAdminWinnersUpsertRoute } from "./winnersUpsert.js";

export function registerAdminWinnerRoutes(router: Router, client: DbClient) {
  registerAdminWinnersListRoute({ router, client });
  registerAdminWinnersUpsertRoute({ router, client });
  registerAdminWinnersFinalizeRoute({ router, client });
}
