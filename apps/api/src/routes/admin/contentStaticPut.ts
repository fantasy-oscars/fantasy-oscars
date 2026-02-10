import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { upsertStaticContent } from "../../data/repositories/cmsRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminContentStaticPutRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.put("/content/static/:key", async (req: AuthedRequest, res, next) => {
    try {
      const key = String(req.params.key ?? "").trim();
      const title = typeof req.body?.title === "string" ? req.body.title : "";
      const body_markdown =
        typeof req.body?.body_markdown === "string" ? req.body.body_markdown : "";
      if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");

      const actorId = Number(req.auth?.sub);
      const content = await upsertStaticContent(client, {
        key,
        title,
        body_markdown,
        actor_user_id: actorId ? actorId : null
      });

      if (actorId) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: actorId,
          action: "cms_static_upsert",
          target_type: "cms_static",
          target_id: null,
          meta: { key, title, body_length: body_markdown.length }
        });
      }

      return res.status(200).json({ content });
    } catch (err) {
      next(err);
    }
  });
}

