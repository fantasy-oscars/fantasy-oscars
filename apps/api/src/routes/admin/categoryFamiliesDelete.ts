import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCategoryFamiliesDeleteRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.delete("/category-families/:id", async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid category template id");
      }

      const { rows } = await query<{ id: number; code: string; name: string }>(
        client,
        `DELETE FROM category_family
         WHERE id = $1
         RETURNING id::int, code, name`,
        [id]
      );
      const deleted = rows[0];
      if (!deleted) {
        throw new AppError("NOT_FOUND", 404, "Category template not found");
      }

      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: "delete_category_family",
          target_type: "category_family",
          target_id: deleted.id,
          meta: { code: deleted.code, name: deleted.name }
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}
