import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { escapeLike, normalizeForSearch, sqlNorm } from "../../domain/search.js";
import { AppError } from "../../errors.js";

export function registerAdminCategoryFamilyRoutes(
  router: Router,
  client: DbClient
): void {
  router.get("/category-families", async (req: AuthedRequest, res, next) => {
    try {
      const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const q = normalizeForSearch(qRaw);
      const like = q ? `%${escapeLike(q)}%` : null;
      const { rows } = await query(
        client,
        `SELECT
           cf.id::int,
           cf.code,
           cf.name,
           cf.default_unit_kind,
           cf.icon_id::int,
           cf.icon_variant,
           i.code AS icon_code
         FROM category_family cf
         JOIN icon i ON i.id = cf.icon_id
         WHERE ${
           like
             ? `(${sqlNorm("cf.code")} LIKE $1 ESCAPE '\\\\' OR ${sqlNorm("cf.name")} LIKE $1 ESCAPE '\\\\')`
             : "TRUE"
         }
         ORDER BY cf.code ASC
         LIMIT 200`,
        like ? [like] : []
      );
      return res.status(200).json({ families: rows });
    } catch (err) {
      next(err);
    }
  });

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

  router.delete("/category-families/:id", async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid category template id");
      }

      const { rows } = await query<{ id: number; code: string; name: string }>(
        client,
        `DELETE FROM category_family
         WHERE id = $1
         RETURNING id::int, code, name`,
        [id]
      );
      const deleted = rows[0];
      if (!deleted) {
        throw new AppError("NOT_FOUND", 404, "Category template not found");
      }

      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: "delete_category_family",
          target_type: "category_family",
          target_id: deleted.id,
          meta: { code: deleted.code, name: deleted.name }
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}
