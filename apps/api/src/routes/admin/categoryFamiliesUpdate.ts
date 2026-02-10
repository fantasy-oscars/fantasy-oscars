import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCategoryFamiliesUpdateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.patch("/category-families/:id", async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid category id");
      }

      const code = typeof req.body?.code === "string" ? req.body.code.trim() : undefined;
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
      const unitKindRaw = req.body?.default_unit_kind;
      const default_unit_kind =
        unitKindRaw === undefined
          ? undefined
          : typeof unitKindRaw === "string"
            ? String(unitKindRaw).toUpperCase()
            : "";
      const iconCode =
        typeof req.body?.icon === "string" ? req.body.icon.trim() : undefined;
      const iconVariantRaw = req.body?.icon_variant;
      const icon_variant =
        iconVariantRaw === undefined
          ? undefined
          : typeof iconVariantRaw === "string"
            ? iconVariantRaw.trim()
            : "";

      if (code !== undefined) {
        if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
        if (!/^[a-z0-9-]+$/.test(code)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Code must be lowercase letters/numbers/dashes only"
          );
        }
      }
      if (name !== undefined && !name) {
        throw new AppError("VALIDATION_FAILED", 400, "Name is required");
      }
      if (default_unit_kind !== undefined) {
        if (!["FILM", "SONG", "PERFORMANCE"].includes(default_unit_kind)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid default_unit_kind");
        }
      }
      if (icon_variant !== undefined) {
        if (!["default", "inverted"].includes(icon_variant)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid icon_variant");
        }
      }

      let resolvedIconId: number | null = null;
      if (iconCode !== undefined) {
        if (!iconCode) throw new AppError("VALIDATION_FAILED", 400, "Icon is required");
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

      if (updates.length === 0) {
        throw new AppError("VALIDATION_FAILED", 400, "No fields to update");
      }

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
          meta: { fields: Object.keys(req.body ?? {}) }
        });
      }

      return res.status(200).json({ family });
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        next(new AppError("VALIDATION_FAILED", 400, "Category code already exists"));
        return;
      }
      next(err);
    }
  });
}

