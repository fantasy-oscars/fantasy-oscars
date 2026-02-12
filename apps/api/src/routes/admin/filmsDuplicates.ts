import type { Router } from "express";
import { type DbClient } from "../../data/db.js";
import { registerAdminFilmDuplicatesListRoute } from "./filmsDuplicatesList.js";
import { registerAdminFilmDuplicatesMergeRoute } from "./filmsDuplicatesMerge.js";

export function registerAdminFilmDuplicateRoutes(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;
  registerAdminFilmDuplicatesListRoute({ router, client });
  registerAdminFilmDuplicatesMergeRoute({ router, client });
}
