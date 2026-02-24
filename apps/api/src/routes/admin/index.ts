import express from "express";
import type { Router } from "express";
import { type DbClient } from "../../data/db.js";
import { registerAdminActiveCeremonyRoutes } from "./activeCeremony.js";
import { registerAdminCeremonyCategoryRoutes } from "./ceremonyCategories.js";
import { registerAdminCeremonyRoutes } from "./ceremonies.js";
import { registerAdminCategoryFamilyRoutes } from "./categoryFamilies.js";
import { registerAdminContentRoutes } from "./content.js";
import { registerAdminIconRoutes } from "./icons.js";
import { registerAdminNomineeUploadRoutes } from "./nomineesUpload.js";
import { registerAdminNominationContributorRoutes } from "./nominationContributors.js";
import { registerAdminNominationRoutes } from "./nominations.js";
import { registerAdminPeopleRoutes } from "./people.js";
import { registerAdminUserRoutes } from "./users.js";
import { registerAdminWinnerRoutes } from "./winners.js";
import { registerAdminFilmRoutes } from "./films.js";

export function createAdminRouter(client: DbClient): Router {
  const router = express.Router();

  registerAdminUserRoutes(router, client);
  registerAdminContentRoutes(router, client);
  registerAdminIconRoutes(router, client);
  registerAdminCategoryFamilyRoutes(router, client);
  registerAdminActiveCeremonyRoutes(router, client);
  registerAdminCeremonyRoutes(router, client);
  registerAdminCeremonyCategoryRoutes(router, client);
  registerAdminWinnerRoutes(router, client);
  registerAdminPeopleRoutes(router, client);
  registerAdminNominationContributorRoutes(router, client);
  registerAdminNomineeUploadRoutes(router, client);
  registerAdminNominationRoutes(router, client);
  registerAdminFilmRoutes(router, client);

  return router;
}
