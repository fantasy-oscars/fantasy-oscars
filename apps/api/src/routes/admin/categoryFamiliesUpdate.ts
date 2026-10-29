import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError, validationError } from "../../errors.js";
import {
  adminCategoryFamilyUpdateBody,
  adminCategoryFamilyUpdateParam
} from "@fantasy-oscars/shared/schemas";
import { definedKeys, parseBody, parseParams } from "../../utils/validate.js";

export function registerAdminCategoryFamiliesUpdateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.patch("/category-families/:id", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(adminCategoryFamilyUpdateParam, req.params);

      const body = parseBody(adminCategoryFamilyUpdateBody, req.body);
      const { code, name, default_unit_kind, icon: iconCode, icon_variant } = body;

      let resolvedIconId: number | null = null;
      if (iconCode !== undefined) {
        const { rows: iconRows } = await query<{ id: number }>(
          client,
          `INSERT INTO icon (code, name, asset_path)
           VALUES ($1, NULL, NULL)
           ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
           RETURNING id::int`,
          [iconCode]
        );
        resolvedIconId = iconRows[0]?.id ?? null;
        if (!resolvedIconId) {
          throw new AppError("INTERNAL_ERROR", 500, "Failed to resolve icon");
        }
      }

      const updates: string[] = [];
      const params: unknown[] = [id];
      function push(fieldSql: string, value: unknown) {
        updates.push(fieldSql.replace("$X", `$${params.length + 1}`));
        params.push(value);
      }

      if (code !== undefined) push(`code = $X`, code);
      if (name !== undefined) push(`name = $X`, name);
      if (default_unit_kind !== undefined)
        push(`default_unit_kind = $X`, default_unit_kind);
      if (resolvedIconId !== null) push(`icon_id = $X`, resolvedIconId);
      if (icon_variant !== undefined) push(`icon_variant = $X`, icon_variant);

      const { rows } = await query(
        client,
        `UPDATE category_family
         SET ${updates.join(", ")}
         WHERE id = $1
         RETURNING id::int, code, name, icon_id::int, icon_variant, default_unit_kind`,
        params
      );
      const family = rows[0];
      if (!family) throw new AppError("NOT_FOUND", 404, "Category template not found");

      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: "update_category_family",
          target_type: "category_family",
          target_id: family.id,
          meta: { fields: definedKeys(body) }
        });
      }

      return res.status(200).json({ family });
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        next(validationError("Category code already exists", ["code"]));
        return;
      }
      next(err);
    }
  });
}
