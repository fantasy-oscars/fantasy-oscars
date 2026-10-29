import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { listDynamicContentByKey } from "../../data/repositories/cmsRepository.js";
import { assertDynamicContentAccess } from "./contentPermissions.js";
import { adminContentKeyParams } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

export function registerAdminContentDynamicListRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/content/dynamic/:key", async (req: AuthedRequest, res, next) => {
    try {
      const { key } = parseParams(adminContentKeyParams, req.params);
      assertDynamicContentAccess(req, key);
      const entries = await listDynamicContentByKey(client, key);
      return res.status(200).json({ entries });
    } catch (err) {
      next(err);
    }
  });
}
