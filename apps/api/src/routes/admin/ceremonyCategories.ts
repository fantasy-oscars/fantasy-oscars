import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { hasDraftsStartedForCeremony } from "../../data/repositories/draftRepository.js";
import { AppError } from "../../errors.js";
import { registerAdminCeremonyCategoriesAddRoute } from "./ceremonyCategoriesAdd.js";
import { registerAdminCeremonyCategoriesCloneRoute } from "./ceremonyCategoriesClone.js";
import { registerAdminCeremonyCategoriesListRoute } from "./ceremonyCategoriesList.js";

export function registerAdminCeremonyCategoryRoutes(router: Router, client: DbClient) {
  registerAdminCeremonyCategoriesListRoute({ router, client });
  registerAdminCeremonyCategoriesCloneRoute({ router, client });
  registerAdminCeremonyCategoriesAddRoute({ router, client });

  router.put(
    "/ceremonies/:id/categories/reorder",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const idsRaw = req.body?.category_ids;
        const categoryIds = Array.isArray(idsRaw)
          ? idsRaw
              .map((v) =>
                typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
              )
              .filter((n) => Number.isInteger(n) && n > 0)
          : [];

        if (categoryIds.length < 1) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "category_ids must include at least one category id"
          );
        }

        // Deduplicate while preserving order.
        const seen = new Set<number>();
        const uniqueIds: number[] = [];
        for (const id of categoryIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          uniqueIds.push(id);
        }

        await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [ceremonyId]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Categories can only be edited while the ceremony is in draft"
            );
          }

          const draftsStarted = await hasDraftsStartedForCeremony(tx, ceremonyId);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Category structural changes are locked after drafts start"
            );
          }

          const { rows: existingRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int
             FROM category_edition
             WHERE ceremony_id = $1 AND id = ANY($2::bigint[])`,
            [ceremonyId, uniqueIds]
          );
          if (existingRows.length !== uniqueIds.length) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "All category_ids must belong to the ceremony",
              { fields: ["category_ids"] }
            );
          }

          for (let i = 0; i < uniqueIds.length; i += 1) {
            await query(
              tx,
              `UPDATE category_edition
               SET sort_index = $2
               WHERE id = $1 AND ceremony_id = $3`,
              [uniqueIds[i], i + 1, ceremonyId]
            );
          }
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "reorder_categories",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: { category_ids: uniqueIds }
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

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

  router.delete(
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

        const { rows: nomCountRows } = await query<{ count: string }>(
          client,
          `SELECT COUNT(*)::int AS count FROM nomination WHERE category_edition_id = $1 AND status = 'ACTIVE'`,
          [id]
        );
        const nomineeCount = Number(nomCountRows[0]?.count ?? 0);
        if (nomineeCount > 0) {
          throw new AppError(
            "CATEGORY_HAS_NOMINEES",
            409,
            "Cannot remove a category that already has nominees"
          );
        }

        await query(client, `DELETE FROM category_edition WHERE id = $1`, [id]);
        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
}
