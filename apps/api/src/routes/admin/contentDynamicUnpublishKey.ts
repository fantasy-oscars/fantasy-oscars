import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { unpublishDynamicContent } from "../../data/repositories/cmsRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminContentDynamicUnpublishKeyRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post(
    "/content/dynamic/:key/unpublish",
    async (req: AuthedRequest, res, next) => {
      try {
        const key = String(req.params.key ?? "").trim();
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        const actorId = Number(req.auth?.sub);
        const updated = await unpublishDynamicContent(client, {
          key,
          actor_user_id: actorId ? actorId : null
        });
        if (!updated) return res.status(200).json({ unpublished: null });

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_dynamic_unpublish",
            target_type: "cms_dynamic",
            target_id: updated.id,
            meta: { key, title: updated.title }
          });
        }

        return res.status(200).json({ unpublished: updated });
      } catch (err) {
        next(err);
      }
    }
  );
}
