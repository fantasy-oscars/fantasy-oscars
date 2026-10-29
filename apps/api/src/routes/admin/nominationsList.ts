import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { listNominationsForCeremony } from "../../data/repositories/nominationRepository.js";
import { adminCeremonyIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

export function registerAdminNominationListRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/ceremonies/:id/nominations",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: ceremonyId } = parseParams(adminCeremonyIdParam, req.params);
        const nominations = await listNominationsForCeremony(client, ceremonyId);
        return res.status(200).json({ nominations });
      } catch (err) {
        next(err);
      }
    }
  );
}
