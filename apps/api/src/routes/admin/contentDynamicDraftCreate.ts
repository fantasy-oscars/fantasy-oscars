import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { createDynamicDraft } from "../../data/repositories/cmsRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminContentDynamicDraftCreateRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post("/content/dynamic/:key/drafts", async (req: AuthedRequest, res, next) => {
    try {
      const key = String(req.params.key ?? "").trim();
      const title = typeof req.body?.title === "string" ? req.body.title : "";
      const body_markdown =
        typeof req.body?.body_markdown === "string" ? req.body.body_markdown : "";
      const variant =
        typeof req.body?.variant === "string"
          ? String(req.body.variant).toLowerCase()
          : undefined;
      const dismissible =
        typeof req.body?.dismissible === "boolean" ? req.body.dismissible : undefined;
      const starts_at =
        typeof req.body?.starts_at === "string" ? req.body.starts_at : undefined;
      const ends_at =
        typeof req.body?.ends_at === "string" ? req.body.ends_at : undefined;
      if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
      const actorId = Number(req.auth?.sub);

      const draft = await createDynamicDraft(client, {
        key,
        title,
        body_markdown,
        variant:
          (variant as "info" | "warning" | "success" | "error" | undefined) ?? undefined,
        dismissible,
        starts_at: starts_at ?? null,
        ends_at: ends_at ?? null,
        actor_user_id: actorId ? actorId : null
      });
      if (!draft) throw new AppError("INTERNAL_ERROR", 500, "Failed to create draft");

      if (actorId) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: actorId,
          action: "cms_dynamic_create_draft",
          target_type: "cms_dynamic",
          target_id: draft.id,
          meta: { key, title, body_length: body_markdown.length }
        });
      }

      return res.status(201).json({ draft });
    } catch (err) {
      next(err);
    }
  });
}
