import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { listWinnersByCeremony } from "../../data/repositories/winnerRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminWinnersListRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/ceremonies/:id/winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        const winners = await listWinnersByCeremony(client, ceremonyId);
        return res.status(200).json({ winners });
      } catch (err) {
        next(err);
      }
    }
  );
}
