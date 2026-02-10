import type express from "express";
import crypto from "crypto";
import {
  ANIMAL_AVATAR_KEYS,
  normalizeEmail,
  validateRegisterInput
} from "@fantasy-oscars/shared";
import type { DbClient } from "../../data/db.js";
import { AppError, validationError } from "../../errors.js";
import { hashPassword } from "./password.js";
import { insertUserWithFallback } from "./users.js";
import { isMissingColumnError, isNotNullViolation } from "./pgErrors.js";

export function registerAuthRegisterRoute(args: {
  router: express.Router;
  client: DbClient;
  authLimiter: { middleware: express.RequestHandler };
}) {
  const { router, client, authLimiter } = args;

  router.post("/register", authLimiter.middleware, async (req, res, next) => {
    try {
      const { username, handle, email, password } = req.body ?? {};
      const rawUsername = username ?? handle;
      if (!rawUsername || !email || !password) {
        throw validationError("Missing required fields", [
          "username",
          "email",
          "password"
        ]);
      }
      if (
        typeof rawUsername !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string"
      ) {
        throw validationError("Invalid field types", ["username", "email", "password"]);
      }
      const trimmedUsername = rawUsername.trim();
      const trimmedEmail = email.trim();
      const normalizedEmail = normalizeEmail(trimmedEmail);
      const usernameDisplay = trimmedUsername;
      const invalidFields = Array.from(
        new Set(
          validateRegisterInput({
            username: trimmedUsername,
            email: trimmedEmail,
            password
          }).map((i) => i.field)
        )
      );
      if (invalidFields.length) {
        throw validationError("Invalid field values", invalidFields);
      }

      const password_hash = await hashPassword(password);
      const password_algo = "scrypt";
      const avatar_key =
        ANIMAL_AVATAR_KEYS[crypto.randomInt(0, ANIMAL_AVATAR_KEYS.length)] ?? "monkey";

      try {
        const { user } = await insertUserWithFallback(client, {
          username_display: usernameDisplay,
          email: normalizedEmail,
          avatar_key,
          password_hash,
          password_algo
        });
        return res.status(201).json({ user });
      } catch (err) {
        // If prod is on a legacy schema during a deploy, return a clear, directed
        // message instead of a generic "Unexpected error".
        if (
          isMissingColumnError(err, "username") ||
          isMissingColumnError(err, "handle") ||
          isMissingColumnError(err, "is_admin") ||
          isNotNullViolation(err, "display_name")
        ) {
          throw new AppError(
            "SERVICE_UNAVAILABLE",
            503,
            "Registration is temporarily unavailable while we update the server. Please try again in a few minutes."
          );
        }

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

