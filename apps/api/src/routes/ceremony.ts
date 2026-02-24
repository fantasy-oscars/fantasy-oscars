import express from "express";
import type { DbClient } from "../data/db.js";
import type { Router } from "express";
import { registerActiveCeremonyGetRoute } from "./ceremonyActiveGet.js";
import { registerActiveCeremonyLockRoute } from "./ceremonyActiveLock.js";
import { registerActiveCeremonyNominationsRoute } from "./ceremonyActiveNominations.js";
import { registerActiveCeremonyWinnersRoute } from "./ceremonyActiveWinners.js";

export function createCeremonyRouter(client: DbClient): Router {
  const router = express.Router();

  registerActiveCeremonyGetRoute({ router, client });
  registerActiveCeremonyLockRoute({ router, client });
  registerActiveCeremonyWinnersRoute({ router, client });
  registerActiveCeremonyNominationsRoute({ router, client });

  return router;
}
