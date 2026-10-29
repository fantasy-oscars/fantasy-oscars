import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { listWinnersByCeremony } from "../../data/repositories/winnerRepository.js";
import { adminCeremonyIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

export function registerAdminWinnersListRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/ceremonies/:id/winners",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: ceremonyId } = parseParams(adminCeremonyIdParam, req.params);
        const winners = await listWinnersByCeremony(client, ceremonyId);
        return res.status(200).json({ winners });
      } catch (err) {
        next(err);
      }
    }
  );
}
