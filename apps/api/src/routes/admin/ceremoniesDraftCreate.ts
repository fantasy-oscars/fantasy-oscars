import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";

export function registerAdminCeremoniesDraftCreateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/ceremonies/drafts",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { rows } = await query(
          client,
          `INSERT INTO ceremony (code, name, year, starts_at, status, published_at, archived_at)
           VALUES (NULL, NULL, NULL, NULL, 'DRAFT', NULL, NULL)
           RETURNING id::int, code, name, year, starts_at, status`,
          []
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "create_ceremony_draft",
            target_type: "ceremony",
            target_id: ceremony.id,
            meta: {}
          });
        }

        return res.status(201).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );
}
