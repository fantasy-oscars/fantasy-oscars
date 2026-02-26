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
           WHERE id = $1`,
          [id]
        );
        const ceremony = ceremonyRows[0];
        if (!ceremony) throw new AppError("NOT_FOUND", 404, "Ceremony not found");

        const { rows: countRows } = await query<{ seasons_removed: number }>(
          client,
          `SELECT COUNT(*)::int AS seasons_removed
           FROM season
           WHERE ceremony_id = $1`,
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
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [id]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CANNOT_DELETE",
              409,
              "Only draft ceremonies can be deleted. Archive instead."
            );
          }

          // Pre-launch behavior: deleting an unpublished ceremony should cascade
          // to all dependent rows (seasons/drafts, categories, nominations, etc.).
          // We'll revisit a safer, explicit flow for published ceremonies later.

          // Detach any pointers to this ceremony.
          await query(
            tx,
            `UPDATE app_config SET active_ceremony_id = NULL WHERE active_ceremony_id = $1`,
            [id]
          );
          await query(tx, `UPDATE league SET ceremony_id = NULL WHERE ceremony_id = $1`, [
            id
          ]);

          // Delete any seasons (will cascade to drafts, invites, members).
          await query(tx, `DELETE FROM season WHERE ceremony_id = $1`, [id]);

          // Winners (normally none for DRAFT, but safe).
          await query(tx, `DELETE FROM ceremony_winner WHERE ceremony_id = $1`, [id]);

          // Delete nominations + related tables, then categories.
          await query(
            tx,
            `DELETE FROM nomination_change_audit
             WHERE nomination_id IN (
               SELECT n.id
               FROM nomination n
               JOIN category_edition ce ON ce.id = n.category_edition_id
               WHERE ce.ceremony_id = $1
             )`,
            [id]
          );
          await query(
            tx,
            `DELETE FROM nomination_contributor
             WHERE nomination_id IN (
               SELECT n.id
               FROM nomination n
               JOIN category_edition ce ON ce.id = n.category_edition_id
               WHERE ce.ceremony_id = $1
             )`,
            [id]
          );
          await query(
            tx,
            `DELETE FROM nomination
             WHERE category_edition_id IN (SELECT id FROM category_edition WHERE ceremony_id = $1)`,
            [id]
          );
          await query(tx, `DELETE FROM category_edition WHERE ceremony_id = $1`, [id]);

          // Finally delete the ceremony itself.
          await query(tx, `DELETE FROM ceremony WHERE id = $1`, [id]);
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
