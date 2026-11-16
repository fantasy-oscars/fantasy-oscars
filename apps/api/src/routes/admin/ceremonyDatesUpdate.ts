import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { setCeremonyDates } from "../../services/circuit/circuitAdmin.js";
import {
  adminCeremonyDatesBody,
  adminCeremonyIdParam
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";
import { actorOf } from "./circuitActor.js";

// Nomination and results dates drive Circuit scoring occasions. They are routine
// content, so they can be set at any ceremony status, archived included.
export function registerAdminCeremonyDatesUpdateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.patch(
    "/ceremonies/:id/dates",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCeremonyIdParam, req.params);
        const dates = parseBody(adminCeremonyDatesBody, req.body);
        const result = await setCeremonyDates(client as Pool, actorOf(req), id, dates);
        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );
}
