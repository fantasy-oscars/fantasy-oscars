import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { updateDynamicDraft } from "../../data/repositories/cmsRepository.js";
import { AppError, validationError } from "../../errors.js";
import { assertDynamicContentAccess } from "./contentPermissions.js";
import {
  adminContentDynamicBody,
  adminContentKeyParams,
  adminDraftIdParam
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";

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
        const { key } = parseParams(adminContentKeyParams, req.params);
        const { title, body_markdown, variant, dismissible, starts_at, ends_at } =
          parseBody(adminContentDynamicBody, req.body);
        assertDynamicContentAccess(req, key);
        const { id } = parseParams(adminDraftIdParam, req.params);
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
          throw validationError("Draft key mismatch", ["key"]);
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
