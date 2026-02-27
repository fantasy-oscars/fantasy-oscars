import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { query } from "../data/db.js";
import { getDraftBoardForCeremony } from "../domain/draftBoard.js";
import { listWinnersByCeremony } from "../data/repositories/winnerRepository.js";
import { AppError } from "../errors.js";

export function registerCeremoniesGetRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  // User-visible ceremony detail (nominees + winners).
  router.get("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
      }

      const { rows } = await query<{
        id: number;
        code: string | null;
        name: string | null;
        year: number | null;
        starts_at: string | null;
        status: string;
      }>(
        client,
        `SELECT id::int, code, name, year, starts_at, status
         FROM ceremony
         WHERE id = $1
           AND deleted_at IS NULL`,
        [id]
      );
      const ceremony = rows[0];
      // Draft ceremonies are admin-only.
      if (!ceremony || ceremony.status === "DRAFT") {
        throw new AppError("NOT_FOUND", 404, "Ceremony not found");
      }

      const board = await getDraftBoardForCeremony(client, id);
      const winners = await listWinnersByCeremony(client, id);
      return res.status(200).json({ ceremony, ...board, winners });
    } catch (err) {
      next(err);
    }
  });
}
