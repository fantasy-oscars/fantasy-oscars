import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyDeleteRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/ceremonies/:id/delete-preview",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }
        const { rows: ceremonyRows } = await query<{ id: number; name: string }>(
          client,
          `SELECT id::int, name
           FROM ceremony
           WHERE id = $1
             AND deleted_at IS NULL`,
          [id]
        );
        const ceremony = ceremonyRows[0];
        if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");

        const { rows: countRows } = await query<{ seasons_removed: number }>(
          client,
          `SELECT COUNT(*)::int AS seasons_removed
           FROM season
           WHERE ceremony_id = $1
             AND deleted_at IS NULL`,
          [id]
        );

        return res.status(200).json({
          ceremony: {
            id: ceremony.id,
            name: ceremony.name
          },
          consequences: {
            seasons_removed: Number(countRows[0]?.seasons_removed ?? 0)
          }
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/ceremonies/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int FROM ceremony WHERE id = $1 AND deleted_at IS NULL`,
            [id]
          );
          if (!ceremonyRows[0])
            throw new AppError("NOT_FOUND", 404, "Ceremony not found");

          // Soft-delete semantics: keep rows, but remove active behavior.

          // Detach any pointers to this ceremony.
          await query(
            tx,
            `UPDATE app_config SET active_ceremony_id = NULL WHERE active_ceremony_id = $1`,
            [id]
          );

          // Cancel seasons tied to this ceremony.
          await query(
            tx,
            `UPDATE season
             SET status = 'CANCELLED',
                 deleted_at = COALESCE(deleted_at, NOW())
             WHERE ceremony_id = $1`,
            [id]
          );

          // Revoke any still-pending invites for those seasons.
          await query(
            tx,
            `UPDATE season_invite
             SET status = 'REVOKED'
             WHERE status = 'PENDING'
               AND season_id IN (SELECT s.id FROM season s WHERE s.ceremony_id = $1)`,
            [id]
          );

          // Disable public league discovery for leagues tied to this ceremony.
          await query(
            tx,
            `UPDATE league
             SET is_public = FALSE,
                 is_public_season = FALSE
             WHERE ceremony_id = $1
               AND deleted_at IS NULL`,
            [id]
          );

          // Archive ceremony itself.
          await query(
            tx,
            `UPDATE ceremony
             SET status = 'ARCHIVED',
                 archived_at = COALESCE(archived_at, NOW()),
                 deleted_at = COALESCE(deleted_at, NOW())
             WHERE id = $1
               AND deleted_at IS NULL`,
            [id]
          );
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "delete_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
}
