import type express from "express";
import { updatePreferencesBodySchema } from "@fantasy-oscars/shared/schemas";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { AppError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import { query } from "../../data/db.js";
import { parseBody } from "../../utils/validate.js";

export function registerAuthPreferencesRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
  originGuard: express.RequestHandler;
}) {
  const { router, client, authSecret, originGuard } = args;

  router.patch(
    "/me/preferences",
    originGuard,
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const userId = Number(req.auth?.sub);
        if (!Number.isInteger(userId) || userId <= 0) {
          throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
        }
        const body = parseBody(updatePreferencesBodySchema, req.body);

        const { rows } = await query<{ brand_preference: string | null }>(
          client,
          `UPDATE app_user
           SET brand_preference = $2
           WHERE id = $1
             AND deleted_at IS NULL
           RETURNING brand_preference`,
          [userId, body.brand_preference]
        );
        if (!rows[0]) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        return res.json({ preferences: { brand_preference: rows[0].brand_preference } });
      } catch (err) {
        next(err);
      }
    }
  );
}
