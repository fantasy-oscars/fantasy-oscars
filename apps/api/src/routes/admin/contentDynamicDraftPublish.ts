import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { publishDynamicContent } from "../../data/repositories/cmsRepository.js";
import { AppError, validationError } from "../../errors.js";
import { assertDynamicContentAccess } from "./contentPermissions.js";
import { adminContentKeyParams, adminDraftIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

export function registerAdminContentDynamicDraftPublishRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post(
    "/content/dynamic/:key/drafts/:id/publish",
    async (req: AuthedRequest, res, next) => {
      try {
        const { key } = parseParams(adminContentKeyParams, req.params);
        assertDynamicContentAccess(req, key);
        const { id } = parseParams(adminDraftIdParam, req.params);
        const actorId = Number(req.auth?.sub);
        const published = await publishDynamicContent(client, {
          id,
          actor_user_id: actorId ? actorId : null
        });
        if (!published) throw new AppError("NOT_FOUND", 404, "Draft not found");
        if (published.key !== key) {
          throw validationError("Draft key mismatch", ["key"]);
        }

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_dynamic_publish",
            target_type: "cms_dynamic",
            target_id: published.id,
            meta: { key, title: published.title }
          });
        }

        return res.status(200).json({ published });
      } catch (err) {
        next(err);
      }
    }
  );
}
