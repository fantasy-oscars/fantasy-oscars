import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { updateDynamicDraft } from "../../data/repositories/cmsRepository.js";
import { AppError } from "../../errors.js";
import { assertDynamicContentAccess } from "./contentPermissions.js";

export function registerAdminContentDynamicDraftUpdateRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.patch(
    "/content/dynamic/:key/drafts/:id",
    async (req: AuthedRequest, res, next) => {
      try {
        const key = String(req.params.key ?? "").trim();
        const id = Number(req.params.id);
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
        assertDynamicContentAccess(req, key);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid draft id");
        }
        const actorId = Number(req.auth?.sub);

        const updated = await updateDynamicDraft(client, {
          id,
          title,
          body_markdown,
          variant:
            (variant as "info" | "warning" | "success" | "error" | undefined) ??
            undefined,
          dismissible,
          starts_at: starts_at ?? null,
          ends_at: ends_at ?? null,
          actor_user_id: actorId ? actorId : null
        });
        if (!updated) throw new AppError("NOT_FOUND", 404, "Draft not found");
        if (updated.key !== key) {
          throw new AppError("VALIDATION_FAILED", 400, "Draft key mismatch");
        }

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action:
              updated.status === "PUBLISHED"
                ? "cms_dynamic_update_published"
                : "cms_dynamic_update_draft",
            target_type: "cms_dynamic",
            target_id: updated.id,
            meta: { key, title, body_length: body_markdown.length }
          });
        }

        return res.status(200).json({ draft: updated });
      } catch (err) {
        next(err);
      }
    }
  );
}
