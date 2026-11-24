import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import { adminCeremonyIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";

// Moves a published ceremony to ACTIVE, freezing its content so drafts can
// start (seasons can already be set up while it is PUBLISHED). Every category
// must have at least one active nominee first.
export function registerAdminCeremonyOpenRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/open",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCeremonyIdParam, req.params);

        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1 AND deleted_at IS NULL`,
          [id]
        );
        const status = ceremonyRows[0]?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "PUBLISHED") {
          throw new AppError(
            "CEREMONY_NOT_PUBLISHED",
            409,
            "Only published ceremonies can be opened for leagues",
            { status }
          );
        }

        const { rows: categoryRows } = await query<{
          id: number;
          name: string;
          nominee_count: number;
        }>(
          client,
          `SELECT
             ce.id::int,
             ce.name,
             COUNT(n.id)::int AS nominee_count
           FROM category_edition ce
           LEFT JOIN nomination n
             ON n.category_edition_id = ce.id
            AND n.status = 'ACTIVE'
           WHERE ce.ceremony_id = $1
           GROUP BY ce.id, ce.name, ce.sort_index
           ORDER BY ce.sort_index ASC, ce.id ASC`,
          [id]
        );
        if (categoryRows.length === 0) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "No categories exist for this ceremony",
            { incomplete_categories: [] }
          );
        }
        const incomplete = categoryRows
          .filter((c) => c.nominee_count === 0)
          .map((c) => ({ id: c.id, name: c.name }));
        if (incomplete.length > 0) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            `These categories have no nominees: ${incomplete.map((c) => c.name).join(", ")}`,
            { incomplete_categories: incomplete }
          );
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony
           SET status = 'ACTIVE'
           WHERE id = $1 AND status = 'PUBLISHED'
           RETURNING id::int, code, name, year, starts_at, status, published_at`,
          [id]
        );
        const ceremony = rows[0];
        if (!ceremony) {
          throw new AppError(
            "CEREMONY_NOT_PUBLISHED",
            409,
            "Only published ceremonies can be opened for leagues"
          );
        }

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "open_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );
}
