import type express from "express";
import type { Pool } from "pg";
import {
  passwordResetConfirmBodySchema,
  passwordResetRequestBodySchema
} from "@fantasy-oscars/shared/schemas";
import type { DbClient } from "../../data/db.js";
import { log } from "../../logger.js";
import { captureServerError } from "../../observability/sentry.js";
import {
  confirmPasswordReset,
  requestPasswordReset
} from "../../services/accountRecovery.js";
import type { Mailer } from "../../services/mail/mailer.js";
import { parseBody } from "../../utils/validate.js";

/** Same body whether or not the address has an account. */
export const PASSWORD_RESET_REQUESTED_BODY = { ok: true } as const;

export function registerAuthPasswordResetRoutes(args: {
  router: express.Router;
  client: DbClient;
  mailer: Mailer;
  webBaseUrl: string;
  requestLimiters: Array<{ middleware: express.RequestHandler }>;
  confirmLimiter: { middleware: express.RequestHandler };
}): void {
  const { router, client, mailer, webBaseUrl, requestLimiters, confirmLimiter } = args;

  router.post(
    "/password-reset/request",
    ...requestLimiters.map((l) => l.middleware),
    async (req, res, next) => {
      try {
        const { email } = parseBody(passwordResetRequestBodySchema, req.body, {
          fields: ["email"]
        });
        // Lookup and token work happen before replying; the email goes out after.
        const delivery = await requestPasswordReset(client as Pool, {
          email,
          webBaseUrl
        });
        res.status(200).json(PASSWORD_RESET_REQUESTED_BODY);

        log({
          level: "info",
          msg: "password_reset_requested",
          outcome: delivery ? "issued" : "no_account",
          ...(delivery ? { user_id: delivery.userId } : {})
        });
        if (delivery) {
          mailer.sendPasswordReset(delivery.to, delivery.link).catch((err: unknown) => {
            log({
              level: "error",
              msg: "password_reset_email_failed",
              user_id: delivery.userId,
              error: err instanceof Error ? err.message : "unknown error"
            });
            captureServerError(err);
          });
        }
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/password-reset/confirm",
    confirmLimiter.middleware,
    async (req, res, next) => {
      try {
        const { token, password } = parseBody(passwordResetConfirmBodySchema, req.body);
        try {
          const { userId } = await confirmPasswordReset(client as Pool, {
            token,
            password
          });
          log({
            level: "info",
            msg: "password_reset_completed",
            outcome: "ok",
            user_id: userId
          });
        } catch (err) {
          log({ level: "info", msg: "password_reset_completed", outcome: "rejected" });
          throw err;
        }
        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
}
