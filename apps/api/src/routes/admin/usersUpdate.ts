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
      if (typeof req.body?.is_admin !== "boolean") {
        throw new AppError("VALIDATION_FAILED", 400, "is_admin must be boolean");
      }
      const isAdmin = Boolean(req.body.is_admin);

      const { rows } = await query(
        client,
        `UPDATE app_user
           SET is_admin = $1
           WHERE id = $2
           RETURNING id::int, username, email, is_admin, created_at`,
        [isAdmin, id]
      );
      const user = rows[0];
      if (!user) throw new AppError("NOT_FOUND", 404, "User not found");

      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: isAdmin ? "promote_admin" : "demote_admin",
          target_type: "user",
          target_id: user.id,
          meta: { username: user.username }
        });
      }
      return res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  });
}

