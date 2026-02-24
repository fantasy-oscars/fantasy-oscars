import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminNomineesUploadCeremonyRoute } from "./nomineesUploadCeremony.js";
import { registerAdminNomineesUploadLegacyRoute } from "./nomineesUploadLegacy.js";

export function registerAdminNomineeUploadRoutes(router: Router, client: DbClient): void {
  registerAdminNomineesUploadCeremonyRoute({ router, client });
  registerAdminNomineesUploadLegacyRoute({ router, client });
}
