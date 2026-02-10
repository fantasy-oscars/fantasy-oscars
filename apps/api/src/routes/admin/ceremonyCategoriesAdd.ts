import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyCategoriesAddRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/categories",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const familyIdRaw = req.body?.family_id;
        const familyId =
          familyIdRaw === undefined || familyIdRaw === null ? null : Number(familyIdRaw);
        if (!familyId || !Number.isInteger(familyId) || familyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "family_id is required");
        }

        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
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

        const unitKind =
          typeof req.body?.unit_kind === "string"
            ? String(req.body.unit_kind).toUpperCase()
            : null;
        const iconCode = typeof req.body?.icon === "string" ? req.body.icon.trim() : "";
        const iconIdRaw = req.body?.icon_id;
        const iconId =
          iconIdRaw === undefined || iconIdRaw === null ? null : Number(iconIdRaw);
        const sortIndexRaw = req.body?.sort_index;
        const sortIndex =
          sortIndexRaw === undefined || sortIndexRaw === null
            ? null
            : Number(sortIndexRaw);

        const { rows: familyRows } = await query<{
          code: string;
          name: string;
          icon_variant: string;
          default_unit_kind: string;
          icon_id: number;
        }>(
          client,
          `SELECT code, name, icon_variant, default_unit_kind, icon_id::int AS icon_id
           FROM category_family
           WHERE id = $1`,
          [familyId]
        );
        const fam = familyRows[0];
        if (!fam) throw new AppError("NOT_FOUND", 404, "Category template not found");

        const finalUnitKind = unitKind ?? String(fam.default_unit_kind).toUpperCase();
        if (!["FILM", "SONG", "PERFORMANCE"].includes(finalUnitKind)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid unit_kind");
        }
        let resolvedIconId = fam.icon_id;
        if (iconCode) {
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
          resolvedIconId = iconRows[0]?.id ?? fam.icon_id;
        } else if (iconId !== null) {
          if (!Number.isInteger(iconId) || iconId <= 0) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_id");
          }
          resolvedIconId = iconId;
        }
        let resolvedSortIndex = 0;
        if (sortIndex !== null) {
          if (!Number.isInteger(sortIndex) || sortIndex < 0) {
            throw new AppError("VALIDATION_FAILED", 400, "Invalid sort_index");
          }
          resolvedSortIndex = sortIndex;
        } else {
          const { rows: sortRows } = await query<{ next_sort: number }>(
            client,
            `SELECT COALESCE(MAX(sort_index), 0)::int + 1 AS next_sort
             FROM category_edition
             WHERE ceremony_id = $1`,
            [ceremonyId]
          );
          resolvedSortIndex = Number(sortRows[0]?.next_sort ?? 0);
        }

        const { rows } = await query(
          client,
          `INSERT INTO category_edition
             (ceremony_id, family_id, code, name, unit_kind, icon_id, icon_variant, sort_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING
             id::int,
             ceremony_id::int,
             family_id::int,
             code,
             name,
             unit_kind,
             icon_id::int,
             icon_variant,
             sort_index::int`,
          [
            ceremonyId,
            familyId,
            fam.code,
            fam.name,
            finalUnitKind,
            resolvedIconId,
            fam.icon_variant ?? "default",
            resolvedSortIndex
          ]
        );

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "add_ceremony_category",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: { family_id: familyId }
          });
        }

        return res.status(201).json({ category: rows[0] });
      } catch (err) {
        // Unique constraint violation on (ceremony_id, family_id)
        if ((err as { code?: string })?.code === "23505") {
          next(
            new AppError("VALIDATION_FAILED", 400, "Category already exists in ceremony")
          );
          return;
        }
        next(err);
      }
    }
  );
}

