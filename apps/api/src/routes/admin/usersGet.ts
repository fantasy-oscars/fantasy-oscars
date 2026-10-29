import type { Router } from "express";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { AppError } from "../../errors.js";
import { adminUserIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

export function registerAdminUsersGetRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/users/:id", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(adminUserIdParam, req.params);
      const { rows } = await query(
        client,
        `SELECT id::int,
                username,
                email,
                is_admin,
                COALESCE(admin_role, CASE WHEN is_admin THEN 'SUPER_ADMIN' ELSE 'NONE' END) AS admin_role,
                created_at
           FROM app_user
           WHERE id = $1
             AND deleted_at IS NULL`,
        [id]
      );
      const user = rows[0];
      if (!user) throw new AppError("NOT_FOUND", 404, "User not found");
      return res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  });
}
