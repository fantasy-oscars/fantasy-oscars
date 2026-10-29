import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { validationError } from "../../errors.js";
import { adminCategoryFamilyCreateBody } from "@fantasy-oscars/shared/schemas";
import { parseBody } from "../../utils/validate.js";

export function registerAdminCategoryFamiliesCreateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post("/category-families", async (req: AuthedRequest, res, next) => {
    try {
      const {
        code,
        name,
        default_unit_kind,
        icon: iconCode,
        icon_id,
        icon_variant
      } = parseBody(adminCategoryFamilyCreateBody, req.body);

      let resolvedIconId: number | null = icon_id;
      if (iconCode) {
        const { rows: iconRows } = await query<{ id: number }>(
          client,
          `INSERT INTO icon (code, name, asset_path)
           VALUES ($1, NULL, NULL)
           ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
           RETURNING id::int`,
          [iconCode]
        );
        resolvedIconId = iconRows[0]?.id ?? null;
      }

      const { rows } = await query(
        client,
        `INSERT INTO category_family (code, name, icon_id, icon_variant, default_unit_kind)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id::int, code, name, icon_id::int, icon_variant, default_unit_kind`,
        [code, name, resolvedIconId, icon_variant, default_unit_kind]
      );
      const family = rows[0];

      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: "create_category_family",
          target_type: "category_family",
          target_id: family.id,
          meta: {
            code,
            name,
            icon: iconCode || resolvedIconId,
            icon_variant,
            default_unit_kind
          }
        });
      }

      return res.status(201).json({ family });
    } catch (err) {
      // Unique constraint violation on category_family.code
      if ((err as { code?: string })?.code === "23505") {
        next(validationError("Category code already exists", ["code"]));
        return;
      }
      next(err);
    }
  });
}
