import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { getStaticContentByKey } from "../../data/repositories/cmsRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminContentStaticGetRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/content/static/:key", async (req: AuthedRequest, res, next) => {
    try {
      const key = String(req.params.key ?? "").trim();
      if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
      const content = await getStaticContentByKey(client, key);
      return res.status(200).json({ content });
    } catch (err) {
      next(err);
    }
  });
}
