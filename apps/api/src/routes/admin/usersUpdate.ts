import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminUsersUpdateRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.patch("/users/:id", async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid user id");
      }
      const roleRaw =
        typeof req.body?.admin_role === "string" ? req.body.admin_role.trim() : "";
      const role = roleRaw.toUpperCase();
      if (!["NONE", "OPERATOR", "SUPER_ADMIN"].includes(role)) {
        throw new AppError(
          "VALIDATION_FAILED",
          400,
          "admin_role must be NONE, OPERATOR, or SUPER_ADMIN"
        );
      }
      const isAdmin = role !== "NONE";
      const roleDb = role === "NONE" ? null : role;

      const { rows } = await query(
        client,
        `UPDATE app_user
           SET is_admin = $1,
               admin_role = $2
           WHERE id = $3
             AND deleted_at IS NULL
           RETURNING id::int,
                     username,
                     email,
                     is_admin,
                     COALESCE(admin_role, CASE WHEN is_admin THEN 'SUPER_ADMIN' ELSE 'NONE' END) AS admin_role,
                     created_at`,
        [isAdmin, roleDb, id]
      );
      const user = rows[0];
      if (!user) throw new AppError("NOT_FOUND", 404, "User not found");

      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: "set_admin_role",
          target_type: "user",
          target_id: user.id,
          meta: { username: user.username, admin_role: user.admin_role }
        });
      }
      return res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  });
}
