import type { Router } from "express";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { AppError } from "../../errors.js";

export function registerAdminUsersGetRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/users/:id", async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid user id");
      }
      const { rows } = await query(
        client,
        `SELECT id::int, username, email, is_admin, created_at
           FROM app_user
           WHERE id = $1`,
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
