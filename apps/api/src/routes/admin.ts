import express from "express";
import { AppError } from "../errors.js";
import { type DbClient, query } from "../data/db.js";
import { AuthedRequest } from "../auth/middleware.js";

export function createAdminRouter(client: DbClient) {
  const router = express.Router();

  router.post(
    "/ceremonies/:id/name",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        if (!name) {
          throw new AppError("VALIDATION_FAILED", 400, "Name is required");
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony SET name = $1
           WHERE id = $2
           RETURNING id, code, name, year`,
          [name, id]
        );
        const ceremony = rows[0];
        if (!ceremony) {
          throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
