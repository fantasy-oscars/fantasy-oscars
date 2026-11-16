import type express from "express";
import type { Pool } from "pg";
import {
  changeEmailBodySchema,
  changePasswordBodySchema
} from "@fantasy-oscars/shared/schemas";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";
import { log } from "../../logger.js";
import { changeEmail, changePassword } from "../../services/accountRecovery.js";
import { parseBody } from "../../utils/validate.js";

function sessionOf(req: AuthedRequest): { userId: number; sessionId: string } {
  const userId = Number(req.auth?.sub);
  const sessionId = req.auth?.sid;
  if (!Number.isInteger(userId) || userId <= 0 || typeof sessionId !== "string") {
    throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
  }
  return { userId, sessionId };
}

export function registerAuthAccountChangeRoutes(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
  originGuard: express.RequestHandler;
  limiter: { middleware: express.RequestHandler };
}): void {
  const { router, client, authSecret, originGuard, limiter } = args;

  router.post(
    "/password",
    originGuard,
    limiter.middleware,
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const { userId, sessionId } = sessionOf(req);
        const { currentPassword, newPassword } = parseBody(
          changePasswordBodySchema,
          req.body
        );
        try {
          await changePassword(client as Pool, {
            userId,
            sessionId,
            currentPassword,
            newPassword
          });
        } catch (err) {
          log({
            level: "info",
            msg: "password_changed",
            outcome: "rejected",
            user_id: userId
          });
          throw err;
        }
        log({ level: "info", msg: "password_changed", outcome: "ok", user_id: userId });
        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/email",
    originGuard,
    limiter.middleware,
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const { userId } = sessionOf(req);
        const { currentPassword, email } = parseBody(changeEmailBodySchema, req.body);
        let result: { email: string };
        try {
          result = await changeEmail(client as Pool, { userId, currentPassword, email });
        } catch (err) {
          log({
            level: "info",
            msg: "email_changed",
            outcome: "rejected",
            user_id: userId
          });
          throw err;
        }
        log({ level: "info", msg: "email_changed", outcome: "ok", user_id: userId });
        return res.status(200).json({ user: { email: result.email } });
      } catch (err) {
        next(err);
      }
    }
  );
}
