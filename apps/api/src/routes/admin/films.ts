import type { Router } from "express";
import type { DbClient } from "../../data/db.js";
import { registerAdminFilmImportRoute } from "./filmsImport.js";
import { registerAdminFilmDuplicateRoutes } from "./filmsDuplicates.js";
import { registerAdminFilmLinkRoutes } from "./filmsLink.js";
import { registerAdminFilmReadRoutes } from "./filmsRead.js";

export function registerAdminFilmRoutes(router: Router, client: DbClient) {
  registerAdminFilmImportRoute({ router, client });
  registerAdminFilmReadRoutes({ router, client });
  registerAdminFilmLinkRoutes({ router, client });
  registerAdminFilmDuplicateRoutes({ router, client });
}
