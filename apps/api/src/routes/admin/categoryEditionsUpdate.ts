import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";

export function registerAdminCategoryEditionsUpdateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.patch(
    "/category-editions/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid category edition id");
        }

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

        const updates: string[] = [];
        const params: unknown[] = [id];
        function push(fieldSql: string, value: unknown) {
          updates.push(fieldSql.replace("$X", `$${params.length + 1}`));
          params.push(value);
        }

        if (typeof req.body?.unit_kind === "string") {
          const unitKind = String(req.body.unit_kind).toUpperCase();
          if (!["FILM", "SONG", "PERFORMANCE"].includes(unitKind)) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid unit_kind");
          }
          push(`unit_kind = $X`, unitKind);
        }
        if (typeof req.body?.icon === "string") {
          const iconCode = req.body.icon.trim();
          if (!iconCode) {
            throw new AppError("VALIDATION_FAILED", 400, "Icon is required");
          }
          if (!/^[a-z0-9-]+$/.test(iconCode)) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Icon must be lowercase letters/numbers/dashes only"
            );
          }
          const { rows: iconRows } = await query<{ id: number }>(
            client,
            `INSERT INTO icon (code, name, asset_path)
             VALUES ($1, NULL, NULL)
             ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
             RETURNING id::int`,
            [iconCode]
          );
          const iconId = iconRows[0]?.id;
          if (!iconId) {
            throw new AppError("INTERNAL_ERROR", 500, "Failed to resolve icon");
          }
          push(`icon_id = $X`, iconId);
        } else if (req.body?.icon_id !== undefined) {
          const iconIdRaw = req.body.icon_id;
          const iconId = iconIdRaw === null ? null : Number(iconIdRaw);
          if (iconId !== null && (!Number.isInteger(iconId) || iconId <= 0)) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_id");
          }
          push(`icon_id = $X`, iconId);
        }
        if (req.body?.sort_index !== undefined) {
          const sortIndex = Number(req.body.sort_index);
          if (!Number.isInteger(sortIndex) || sortIndex < 0) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid sort_index");
          }
          push(`sort_index = $X`, sortIndex);
        }

        if (updates.length === 0) {
          throw new AppError("VALIDATION_FAILED", 400, "No fields to update");
        }

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
