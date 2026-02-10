import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import { listNominationsForCeremony } from "../data/repositories/nominationRepository.js";

export function registerActiveCeremonyNominationsRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/active/nominations", async (_req, res, next) => {
    try {
      const activeId = await getActiveCeremonyId(client);
      if (!activeId) {
        return res.json({ nominations: [] });
      }
      const nominations = await listNominationsForCeremony(client, activeId);
      return res.json({ nominations });
    } catch (err) {
      next(err);
    }
  });
}

