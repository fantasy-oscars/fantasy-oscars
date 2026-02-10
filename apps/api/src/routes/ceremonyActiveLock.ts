import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import { getCeremonyDraftLockedAt } from "../data/repositories/ceremonyRepository.js";

export function registerActiveCeremonyLockRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/active/lock", async (_req, res, next) => {
    try {
      const activeId = await getActiveCeremonyId(client);
      if (!activeId) {
        return res.json({ draft_locked: false, draft_locked_at: null });
      }
      const lockedAt = await getCeremonyDraftLockedAt(client, activeId);
      return res.json({
        draft_locked: Boolean(lockedAt),
        draft_locked_at: lockedAt ?? null
      });
    } catch (err) {
      next(err);
    }
  });
}

