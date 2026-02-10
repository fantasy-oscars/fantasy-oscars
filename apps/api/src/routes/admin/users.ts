import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import { escapeLike, normalizeForSearch, sqlNorm } from "../../domain/search.js";

export function registerAdminUserRoutes(router: Router, client: DbClient): void {
  router.get(
    "/users",
    async (req: AuthedRequest, res, next) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!q) return res.status(200).json({ users: [] });

        const likeRaw = `%${escapeLike(q)}%`;
        const likeNorm = `%${escapeLike(normalizeForSearch(q))}%`;
        const { rows } = await query(
          client,
          `SELECT id::int, username, email, is_admin, created_at
           FROM app_user
           WHERE username ILIKE $1 ESCAPE '\\'
              OR email ILIKE $1 ESCAPE '\\'
              OR ${sqlNorm("username")} LIKE $2 ESCAPE '\\'
              OR ${sqlNorm("coalesce(email, '')")} LIKE $2 ESCAPE '\\'
           ORDER BY created_at DESC
           LIMIT 25`,
          [likeRaw, likeNorm]
        );
        return res.status(200).json({ users: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/users/:id",
    async (req: AuthedRequest, res, next) => {
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
    }
  );

  router.patch(
    "/users/:id",
    async (req: AuthedRequest, res, next) => {
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
    }
  );
}

