import type express from "express";
import { updatePreferencesBodySchema } from "@fantasy-oscars/shared/schemas";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { AppError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import { updateUserPreferences } from "../../data/repositories/userAppearanceRepository.js";
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

        const preferences = await updateUserPreferences(client, userId, body);
        if (!preferences) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        return res.json({ preferences });
      } catch (err) {
        next(err);
      }
    }
  );
}
