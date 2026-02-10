import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import { listWinnersByCeremony } from "../data/repositories/winnerRepository.js";

export function registerActiveCeremonyWinnersRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/active/winners", async (_req, res, next) => {
    try {
      const activeId = await getActiveCeremonyId(client);
      if (!activeId) {
        return res.json({ winners: [] });
      }
      const winners = await listWinnersByCeremony(client, activeId);
      return res.json({ winners });
    } catch (err) {
      next(err);
    }
  });
}

