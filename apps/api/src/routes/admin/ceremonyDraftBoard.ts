import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";
import { getDraftBoardForCeremony } from "../../domain/draftBoard.js";

export function registerAdminCeremonyDraftBoardRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/ceremonies/:id/draft-board",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        // Ensure ceremony exists (and avoid leaking row-level information).
        const { rows } = await query<{ id: number }>(
          client,
          `SELECT id::int FROM ceremony WHERE id = $1`,
          [id]
        );
        if (!rows[0]) throw new AppError("NOT_FOUND", 404, "Ceremony not found");

        const board = await getDraftBoardForCeremony(client, id);
        return res.status(200).json(board);
      } catch (err) {
        next(err);
      }
    }
  );
}
