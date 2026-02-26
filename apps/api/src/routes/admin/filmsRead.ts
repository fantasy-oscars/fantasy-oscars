import type { Router } from "express";
import { type DbClient } from "../../data/db.js";
import { registerAdminFilmsCreditsRoute } from "./filmsReadCredits.js";
import { registerAdminFilmsGetByTmdbRoute } from "./filmsReadGetByTmdb.js";
import { registerAdminFilmsListRoute } from "./filmsReadList.js";
import { registerAdminFilmsTmdbSearchRoute } from "./filmsReadTmdbSearch.js";

export function registerAdminFilmReadRoutes(args: { router: Router; client: DbClient }) {
  const { router, client } = args;
  registerAdminFilmsListRoute({ router, client });
  registerAdminFilmsTmdbSearchRoute({ router, client });
  registerAdminFilmsGetByTmdbRoute({ router, client });
  registerAdminFilmsCreditsRoute({ router, client });
}
