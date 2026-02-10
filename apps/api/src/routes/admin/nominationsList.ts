import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { listNominationsForCeremony } from "../../data/repositories/nominationRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminNominationListRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/ceremonies/:id/nominations",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        const nominations = await listNominationsForCeremony(client, ceremonyId);
        return res.status(200).json({ nominations });
      } catch (err) {
        next(err);
      }
    }
  );
}

