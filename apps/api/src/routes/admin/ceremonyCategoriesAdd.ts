import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError, validationError } from "../../errors.js";
import {
  adminCeremonyCategoryAddBody,
  adminCeremonyIdParam
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";

export function registerAdminCeremonyCategoriesAddRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/ceremonies/:id/categories",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: ceremonyId } = parseParams(adminCeremonyIdParam, req.params);

        const {
          family_id: familyId,
          unit_kind: unitKind,
          icon: iconCode,
          icon_id: iconId,
          sort_index: sortIndex
        } = parseBody(adminCeremonyCategoryAddBody, req.body);

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
        let resolvedIconId = fam.icon_id;
        if (iconCode) {
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
          resolvedIconId = iconId;
        }
        let resolvedSortIndex = 0;
        if (sortIndex !== null) {
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
          next(validationError("Category already exists in ceremony", ["family_id"]));
          return;
        }
        next(err);
      }
    }
  );
}
