import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCategoryFamiliesCreateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post("/category-families", async (req: AuthedRequest, res, next) => {
    try {
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const unitKindRaw = req.body?.default_unit_kind;
      const default_unit_kind =
        typeof unitKindRaw === "string" ? String(unitKindRaw).toUpperCase() : "";
      const iconCode = typeof req.body?.icon === "string" ? req.body.icon.trim() : "";
      const iconVariantRaw = req.body?.icon_variant;
      const icon_variant =
        typeof iconVariantRaw === "string" ? iconVariantRaw.trim() : "default";
      const iconIdRaw = req.body?.icon_id;
      const icon_id =
        iconIdRaw === undefined || iconIdRaw === null ? null : Number(iconIdRaw);

      if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
      if (!/^[a-z0-9-]+$/.test(code)) {
        throw new AppError(
          "VALIDATION_FAILED",
          400,
          "Code must be lowercase letters/numbers/dashes only"
        );
      }
      if (!name) throw new AppError("VALIDATION_FAILED", 400, "Name is required");
      if (!["FILM", "SONG", "PERFORMANCE"].includes(default_unit_kind)) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid default_unit_kind");
      }
      if (!["default", "inverted"].includes(icon_variant)) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_variant");
      }

      let resolvedIconId: number | null = null;
      if (iconCode) {
        if (!/^[a-z0-9-_]+$/.test(iconCode)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Icon must be lowercase letters/numbers/dashes/underscores only"
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
        resolvedIconId = iconRows[0]?.id ?? null;
      } else if (icon_id !== null) {
        if (!Number.isInteger(icon_id) || icon_id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_id");
        }
        resolvedIconId = icon_id;
      } else {
        throw new AppError("VALIDATION_FAILED", 400, "Icon is required");
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
        next(new AppError("VALIDATION_FAILED", 400, "Category code already exists"));
        return;
      }
      next(err);
    }
  });
}

