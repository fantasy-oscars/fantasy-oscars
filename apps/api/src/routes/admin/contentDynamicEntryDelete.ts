import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import { assertDynamicContentAccess } from "./contentPermissions.js";

export function registerAdminContentDynamicEntryDeleteRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.delete(
    "/content/dynamic/:key/entries/:id",
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

        const { rows: deletedRows } = await query<{ id: number }>(
          client,
          `DELETE FROM cms_dynamic_content
         WHERE id = $1 AND key = $2 AND status = 'DRAFT'
         RETURNING id::int`,
          [id, key]
        );
        const deleted = deletedRows[0];
        if (!deleted) {
          const { rows } = await query<{ status: string }>(
            client,
            `SELECT status FROM cms_dynamic_content WHERE id = $1 AND key = $2`,
            [id, key]
          );
          const status = rows[0]?.status;
          if (status === "PUBLISHED") {
            throw new AppError(
              "CANNOT_DELETE_PUBLISHED",
              409,
              "Cannot delete a published entry. Unpublish it first."
            );
          }
          throw new AppError("NOT_FOUND", 404, "Entry not found");
        }

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "cms_dynamic_delete_entry",
            target_type: "cms_dynamic",
            target_id: deleted.id,
            meta: { key }
          });
        }

        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
}
