import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";
import {
  adminCategoryEditionIdParam,
  adminCategoryEditionUpdateBody
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";

export function registerAdminCategoryEditionsUpdateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.patch(
    "/category-editions/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCategoryEditionIdParam, req.params);

        const { rows: ceRows } = await query<{ ceremony_id: number; status: string }>(
          client,
          `SELECT ce.ceremony_id::int AS ceremony_id, c.status
           FROM category_edition ce
           JOIN ceremony c ON c.id = ce.ceremony_id
           WHERE ce.id = $1`,
          [id]
        );
        const ce = ceRows[0];
        if (!ce) throw new AppError("NOT_FOUND", 404, "Category edition not found");
        if (ce.status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Categories can only be edited while the ceremony is in draft"
          );
        }

        const body = parseBody(adminCategoryEditionUpdateBody, req.body);

        const updates: string[] = [];
        const params: unknown[] = [id];
        function push(fieldSql: string, value: unknown) {
          updates.push(fieldSql.replace("$X", `$${params.length + 1}`));
          params.push(value);
        }

        if (body.unit_kind !== undefined) push(`unit_kind = $X`, body.unit_kind);
        if (body.icon !== undefined) {
          const { rows: iconRows } = await query<{ id: number }>(
            client,
            `INSERT INTO icon (code, name, asset_path)
             VALUES ($1, NULL, NULL)
             ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
             RETURNING id::int`,
            [body.icon]
          );
          const iconId = iconRows[0]?.id;
          if (!iconId) {
            throw new AppError("INTERNAL_ERROR", 500, "Failed to resolve icon");
          }
          push(`icon_id = $X`, iconId);
        } else if (body.icon_id !== undefined) {
          push(`icon_id = $X`, body.icon_id);
        }
        if (body.sort_index !== undefined) push(`sort_index = $X`, body.sort_index);

        const { rows } = await query(
          client,
          `UPDATE category_edition
           SET ${updates.join(", ")}
           WHERE id = $1
           RETURNING id::int, ceremony_id::int, family_id::int, unit_kind, icon_id::int, sort_index::int`,
          params
        );

        return res.status(200).json({ category: rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );
}
