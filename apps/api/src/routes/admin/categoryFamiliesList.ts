import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { escapeLike, normalizeForSearch, sqlNorm } from "../../domain/search.js";

export function registerAdminCategoryFamiliesListRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

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
}
