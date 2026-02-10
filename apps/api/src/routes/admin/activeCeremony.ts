import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminActiveCeremonySetRoute } from "./activeCeremonySet.js";
import { registerAdminCeremonyNameUpdateRoute } from "./ceremonyNameUpdate.js";

export function registerAdminActiveCeremonyRoutes(
  router: Router,
  client: DbClient
): void {
  registerAdminCeremonyNameUpdateRoute({ router, client });
  registerAdminActiveCeremonySetRoute({ router, client });
}
