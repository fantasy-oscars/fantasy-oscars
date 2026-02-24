import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { listDynamicContentByKey } from "../../data/repositories/cmsRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminContentDynamicListRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/content/dynamic/:key", async (req: AuthedRequest, res, next) => {
    try {
      const key = String(req.params.key ?? "").trim();
      if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
      const entries = await listDynamicContentByKey(client, key);
      return res.status(200).json({ entries });
    } catch (err) {
      next(err);
    }
  });
}
