import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import { assertDynamicContentAccess } from "./contentPermissions.js";

export function registerAdminContentDynamicEntryUnpublishRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post(
    "/content/dynamic/:key/entries/:id/unpublish",
    async (req: AuthedRequest, res, next) => {
      try {
        const key = String(req.params.key ?? "").trim();
        const id = Number(req.params.id);
        if (!key) throw new AppError("VALIDATION_FAILED", 400, "Key is required");
        assertDynamicContentAccess(req, key);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid entry id");
        }
        const actorId = Number(req.auth?.sub);

        const { rows } = await query(
          client,
          `UPDATE cms_dynamic_content
           SET status = 'DRAFT',
               published_at = NULL,
               published_by_user_id = NULL,
               updated_at = now(),
               updated_by_user_id = $1
           WHERE id = $2
           RETURNING id::int, key, title, status, published_at`,
          [actorId ? actorId : null, id]
        );
        const row = rows[0];
        if (!row) throw new AppError("NOT_FOUND", 404, "Entry not found");
        if (row.key !== key)
          throw new AppError("VALIDATION_FAILED", 400, "Entry key mismatch");

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_dynamic_unpublish_entry",
            target_type: "cms_dynamic",
            target_id: row.id,
            meta: { key }
          });
        }

        return res.status(200).json({ entry: row });
      } catch (err) {
        next(err);
      }
    }
  );
}
