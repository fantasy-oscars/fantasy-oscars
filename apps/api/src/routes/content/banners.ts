import type express from "express";
import type { DbClient } from "../../data/db.js";
import { listPublishedDynamicContentByKey } from "../../data/repositories/cmsRepository.js";

export function registerContentBannersRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get("/banners", async (_req, res, next) => {
    try {
      const all = await listPublishedDynamicContentByKey(client, "banner");
      const now = Date.now();
      const active = all.filter((b) => {
        const starts = b.starts_at ? new Date(b.starts_at).getTime() : null;
        const ends = b.ends_at ? new Date(b.ends_at).getTime() : null;
        if (starts && Number.isFinite(starts) && starts > now) return false;
        if (ends && Number.isFinite(ends) && ends <= now) return false;
        return true;
      });
      return res.status(200).json({ banners: active });
    } catch (err) {
      next(err);
    }
  });
}

