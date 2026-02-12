import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminIconsCreateRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post("/icons", async (req: AuthedRequest, res, next) => {
    try {
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
      if (!/^[a-z0-9-]+$/.test(code)) {
        throw new AppError(
          "VALIDATION_FAILED",
          400,
          "Icon code must be lowercase letters/numbers/dashes only"
        );
      }

      // Find-or-create.
      const { rows: existingRows } = await query<{ id: number; code: string }>(
        client,
        `SELECT id::int, code FROM icon WHERE code = $1`,
        [code]
      );
      if (existingRows[0]) return res.status(200).json({ icon: existingRows[0] });

      const { rows } = await query<{ id: number; code: string }>(
        client,
        `INSERT INTO icon (code, name, asset_path)
         VALUES ($1, NULL, NULL)
         RETURNING id::int, code`,
        [code]
      );
      const icon = rows[0];

      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: "create_icon",
          target_type: "icon",
          target_id: icon.id,
          meta: { code }
        });
      }

      return res.status(201).json({ icon });
    } catch (err) {
      // Unique constraint violation on icon.code
      if ((err as { code?: string })?.code === "23505") {
        const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
        const { rows } = await query<{ id: number; code: string }>(
          client,
          `SELECT id::int, code FROM icon WHERE code = $1`,
          [code]
        );
        if (rows[0]) return res.status(200).json({ icon: rows[0] });
      }
      next(err);
    }
  });
}
