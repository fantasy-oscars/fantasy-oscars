import type express from "express";
import crypto from "crypto";
import { ANIMAL_AVATAR_KEYS } from "@fantasy-oscars/shared";
import { registerBodySchema } from "@fantasy-oscars/shared/schemas";
import type { DbClient } from "../../data/db.js";
import { AppError } from "../../errors.js";
import { parseBody } from "../../utils/validate.js";
import { hashPassword } from "./password.js";
import { insertUser } from "./users.js";

export function registerAuthRegisterRoute(args: {
  router: express.Router;
  client: DbClient;
  authLimiter: { middleware: express.RequestHandler };
}) {
  const { router, client, authLimiter } = args;

  router.post("/register", authLimiter.middleware, async (req, res, next) => {
    try {
      const { username, email, password } = parseBody(registerBodySchema, req.body, {
        fields: ["username", "email", "password"]
      });

      const password_hash = await hashPassword(password);
      const password_algo = "scrypt";
      const avatar_key =
        ANIMAL_AVATAR_KEYS[crypto.randomInt(0, ANIMAL_AVATAR_KEYS.length)] ?? "monkey";

      try {
        const { user } = await insertUser(client, {
          username_display: username,
          email,
          avatar_key,
          password_hash,
          password_algo
        });
        return res.status(201).json({ user });
      } catch (err) {
        const pgErr = err as {
          code?: string;
          table?: string;
          constraint?: string;
          message?: string;
        };
        const constraint = pgErr.constraint ?? pgErr.message ?? "";
        if (
          (pgErr.code === "23505" && pgErr.table === "app_user") ||
          constraint.includes("app_user_handle_key") ||
          constraint.includes("app_user_username_key") ||
          constraint.includes("app_user_email_key") ||
          constraint.includes("app_user_username_lower_key") ||
          constraint.includes("app_user_email_lower_key")
        ) {
          throw new AppError(
            "USER_EXISTS",
            409,
            "User with username/email already exists"
          );
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });
}
