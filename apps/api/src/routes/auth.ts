import express from "express";
import type { Router } from "express";
import crypto from "crypto";
import {
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  normalizeUsername,
  validatePassword,
  validateRegisterInput,
  validateUsername
} from "@fantasy-oscars/shared";
import { DbClient, query } from "../data/db.js";
import { AppError, validationError } from "../errors.js";
import { signToken } from "../auth/token.js";
import { requireAuth, AuthedRequest } from "../auth/middleware.js";
import { createRateLimitGuard } from "../utils/rateLimitMiddleware.js";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

const authLimiter = createRateLimitGuard({
  windowMs: 60_000,
  max: 8
});

const resetLimiter = createRateLimitGuard({
  windowMs: 60_000,
  max: 5
});

function scryptAsync(
  password: string,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p
  });
  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64")
  ].join("$");
}

function verifySha256(password: string, passwordHash: string) {
  const hash = crypto.createHash("sha256").update(password).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(passwordHash));
}

async function verifyPassword(
  password: string,
  passwordHash: string,
  passwordAlgo: string
) {
  if (passwordAlgo === "sha256") {
    return verifySha256(password, passwordHash);
  }
  if (passwordAlgo !== "scrypt") return false;
  const parts = passwordHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const keyLen = Buffer.from(hashB64, "base64").length;
  const derived = await scryptAsync(password, salt, keyLen, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw)
  });
  return crypto.timingSafeEqual(derived, Buffer.from(hashB64, "base64"));
}

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isMissingColumnError(err: unknown, column: string): boolean {
  const pgErr = err as { code?: string; message?: string };
  if (pgErr?.code !== "42703") return false; // undefined_column
  const msg = String(pgErr?.message ?? "");
  return (
    msg.includes(`"${column}"`) || msg.includes(`'${column}'`) || msg.includes(column)
  );
}

function isNotNullViolation(err: unknown, column: string): boolean {
  const pgErr = err as { code?: string; message?: string; column?: string };
  if (pgErr?.code !== "23502") return false; // not_null_violation
  if (pgErr?.column === column) return true;
  const msg = String(pgErr?.message ?? "");
  return (
    msg.includes(`"${column}"`) || msg.includes(`'${column}'`) || msg.includes(column)
  );
}

async function insertUserWithFallback(
  client: DbClient,
  input: {
    // Store the username with the user's preferred casing (trimmed), while
    // deduping/searching case-insensitively via lower(username) indexes/queries.
    username_display: string;
    email: string;
    password_hash: string;
    password_algo: string;
  }
) {
  // Try to insert into the "new" schema first (username/email/is_admin).
  try {
    const { rows } = await query(
      client,
      `INSERT INTO app_user (username, email)
       VALUES ($1, $2)
       RETURNING id, username, email, created_at, is_admin`,
      [input.username_display, input.email]
    );
    const user = rows[0];
    await query(
      client,
      `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
      [user.id, input.password_hash, input.password_algo]
    );
    return { user };
  } catch (err) {
    // Legacy schema sometimes required `display_name` (NOT NULL). If so, mirror the
    // username as display_name to keep dogfooding ergonomic until DB reset.
    if (isNotNullViolation(err, "display_name")) {
      try {
        const { rows } = await query(
          client,
          `INSERT INTO app_user (username, email, display_name)
           VALUES ($1, $2, $3)
           RETURNING id, username, email, created_at, is_admin`,
          [input.username_display, input.email, input.username_display]
        );
        const user = rows[0];
        await query(
          client,
          `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
          [user.id, input.password_hash, input.password_algo]
        );
        return { user };
      } catch (displayErr) {
        if (isMissingColumnError(displayErr, "is_admin")) {
          const { rows } = await query(
            client,
            `INSERT INTO app_user (username, email, display_name)
             VALUES ($1, $2, $3)
             RETURNING id, username, email, created_at`,
            [input.username_display, input.email, input.username_display]
          );
          const user = rows[0];
          await query(
            client,
            `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
            [user.id, input.password_hash, input.password_algo]
          );
          return { user: { ...user, is_admin: false } };
        }
        throw displayErr;
      }
    }

    // If a pre-squash DB is missing columns, retry using the older schema.
    if (isMissingColumnError(err, "is_admin")) {
      const { rows } = await query(
        client,
        `INSERT INTO app_user (username, email)
         VALUES ($1, $2)
         RETURNING id, username, email, created_at`,
        [input.username_display, input.email]
      );
      const user = rows[0];
      await query(
        client,
        `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
        [user.id, input.password_hash, input.password_algo]
      );
      return { user: { ...user, is_admin: false } };
    }

    if (isMissingColumnError(err, "username")) {
      // Legacy schema used `handle` instead of `username`.
      try {
        const { rows } = await query(
          client,
          `INSERT INTO app_user (handle, email)
           VALUES ($1, $2)
           RETURNING id, handle AS username, email, created_at, is_admin`,
          [input.username_display, input.email]
        );
        const user = rows[0];
        await query(
          client,
          `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
          [user.id, input.password_hash, input.password_algo]
        );
        return { user };
      } catch (legacyErr) {
        if (isNotNullViolation(legacyErr, "display_name")) {
          try {
            const { rows } = await query(
              client,
              `INSERT INTO app_user (handle, email, display_name)
               VALUES ($1, $2, $3)
               RETURNING id, handle AS username, email, created_at, is_admin`,
              [input.username_display, input.email, input.username_display]
            );
            const user = rows[0];
            await query(
              client,
              `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
              [user.id, input.password_hash, input.password_algo]
            );
            return { user };
          } catch (legacyDisplayErr) {
            if (isMissingColumnError(legacyDisplayErr, "is_admin")) {
              const { rows } = await query(
                client,
                `INSERT INTO app_user (handle, email, display_name)
                 VALUES ($1, $2, $3)
                 RETURNING id, handle AS username, email, created_at`,
                [input.username_display, input.email, input.username_display]
              );
              const user = rows[0];
              await query(
                client,
                `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
                [user.id, input.password_hash, input.password_algo]
              );
              return { user: { ...user, is_admin: false } };
            }
            throw legacyDisplayErr;
          }
        }

        if (isMissingColumnError(legacyErr, "is_admin")) {
          const { rows } = await query(
            client,
            `INSERT INTO app_user (handle, email)
             VALUES ($1, $2)
             RETURNING id, handle AS username, email, created_at`,
            [input.username_display, input.email]
          );
          const user = rows[0];
          await query(
            client,
            `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
            [user.id, input.password_hash, input.password_algo]
          );
          return { user: { ...user, is_admin: false } };
        }
        throw legacyErr;
      }
    }

    throw err;
  }
}

export function createAuthRouter(client: DbClient, opts: { authSecret: string }): Router {
  const router = express.Router();
  const { authSecret } = opts;
  const isProd = process.env.NODE_ENV === "production";
  // Dogfooding preference: keep sessions long-lived to avoid "random" logouts.
  // NOTE: This is a single JWT in an HttpOnly cookie (no refresh/rotation yet),
  // so shortening this (or adding refresh tokens) is recommended before go-live.
  const AUTH_COOKIE_TTL_DAYS = 90;
  const authCookieMaxAgeMs = AUTH_COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const cookieConfig = {
    name: "auth_token",
    maxAgeMs: authCookieMaxAgeMs,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: isProd,
    path: "/" as const
  };

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

      try {
        const { user } = await insertUserWithFallback(client, {
          username_display: usernameDisplay,
          email: normalizedEmail,
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

  router.post("/login", authLimiter.middleware, async (req, res, next) => {
    try {
      const { username, handle, password } = req.body ?? {};
      const rawUsername = username ?? handle;
      if (!rawUsername || !password) {
        throw validationError("Missing required fields", ["username", "password"]);
      }
      if (typeof rawUsername !== "string" || typeof password !== "string") {
        throw validationError("Invalid field types", ["username", "password"]);
      }
      const usernameIssues = validateUsername(rawUsername).filter(
        (i) => i.code !== "REQUIRED"
      );
      const passwordIssues = validatePassword(password).filter(
        (i) => i.code !== "REQUIRED"
      );
      if (usernameIssues.length || passwordIssues.length) {
        throw validationError("Invalid credentials", ["username", "password"]);
      }

      const normalizedUsername = normalizeUsername(rawUsername);
      const tryQueries: Array<() => Promise<unknown[]>> = [
        async () =>
          (
            await query(
              client,
              `SELECT u.id, u.username, u.email, u.is_admin, p.password_hash, p.password_algo
               FROM app_user u
               JOIN auth_password p ON p.user_id = u.id
               WHERE lower(u.username) = $1`,
              [normalizedUsername]
            )
          ).rows as unknown[],
        async () =>
          (
            await query(
              client,
              `SELECT u.id, u.username, u.email, false AS is_admin, p.password_hash, p.password_algo
               FROM app_user u
               JOIN auth_password p ON p.user_id = u.id
               WHERE lower(u.username) = $1`,
              [normalizedUsername]
            )
          ).rows as unknown[],
        async () =>
          (
            await query(
              client,
              `SELECT u.id, u.handle AS username, u.email, u.is_admin, p.password_hash, p.password_algo
               FROM app_user u
               JOIN auth_password p ON p.user_id = u.id
               WHERE lower(u.handle) = $1`,
              [normalizedUsername]
            )
          ).rows as unknown[],
        async () =>
          (
            await query(
              client,
              `SELECT u.id, u.handle AS username, u.email, false AS is_admin, p.password_hash, p.password_algo
               FROM app_user u
               JOIN auth_password p ON p.user_id = u.id
               WHERE lower(u.handle) = $1`,
              [normalizedUsername]
            )
          ).rows as unknown[]
      ];

      let rows: unknown[] | undefined;
      let lastErr: unknown = undefined;
      for (const run of tryQueries) {
        try {
          rows = await run();
          break;
        } catch (err) {
          lastErr = err;
          // Only continue retrying on missing-column errors.
          if (
            !isMissingColumnError(err, "is_admin") &&
            !isMissingColumnError(err, "username") &&
            !isMissingColumnError(err, "handle")
          ) {
            break;
          }
        }
      }
      if (!rows) {
        if (
          isMissingColumnError(lastErr, "username") ||
          isMissingColumnError(lastErr, "handle") ||
          isMissingColumnError(lastErr, "is_admin")
        ) {
          throw new AppError(
            "SERVICE_UNAVAILABLE",
            503,
            "Login is temporarily unavailable while we update the server. Please try again in a few minutes."
          );
        }
        throw lastErr;
      }

      const user = rows[0] as {
        id: string | number;
        username: string;
        email: string;
        is_admin: boolean;
        password_hash: string;
        password_algo: string;
      };
      if (!user) throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");

      const isValid = await verifyPassword(
        password,
        user.password_hash,
        user.password_algo
      );
      if (!isValid) {
        throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
      }

      // Skeleton: return placeholder token (non-secure) for v0.
      const token = signToken(
        { sub: String(user.id), username: user.username, is_admin: user.is_admin },
        authSecret,
        Math.floor(cookieConfig.maxAgeMs / 1000)
      );
      res.cookie(cookieConfig.name, token, {
        httpOnly: cookieConfig.httpOnly,
        sameSite: cookieConfig.sameSite,
        secure: cookieConfig.secure,
        maxAge: cookieConfig.maxAgeMs,
        path: cookieConfig.path
      });
      return res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_admin: user.is_admin
        },
        token
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", requireAuth(authSecret), (req: AuthedRequest, res) => {
    return res.json({ user: req.auth });
  });

  router.post("/logout", (_req, res) => {
    res
      .clearCookie(cookieConfig.name, {
        httpOnly: cookieConfig.httpOnly,
        sameSite: cookieConfig.sameSite,
        secure: cookieConfig.secure,
        path: cookieConfig.path
      })
      .status(204)
      .end();
  });

  router.post("/reset-request", resetLimiter.middleware, async (req, res, next) => {
    try {
      const { email } = req.body ?? {};
      if (!email) {
        throw validationError("Missing required fields", ["email"]);
      }
      if (typeof email !== "string") {
        throw validationError("Invalid field types", ["email"]);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        throw validationError("Invalid field values", ["email"]);
      }

      const normalizedEmail = email.trim().toLowerCase();
      const { rows } = await query(
        client,
        `SELECT id, username FROM app_user WHERE email = $1`,
        [normalizedEmail]
      );
      const user = rows[0];

      // Always return 200 to avoid email enumeration
      if (!user) {
        return res.status(200).json({ ok: true, delivery: "suppressed" });
      }

      const rawToken = crypto.randomBytes(24).toString("base64url");
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await query(
        client,
        `INSERT INTO auth_password_reset (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );

      if (isProd) {
        return res.status(200).json({ ok: true, delivery: "email" });
      }

      // Dev/test: return token directly
      return res.status(200).json({ ok: true, delivery: "inline", token: rawToken });
    } catch (err) {
      next(err);
    }
  });

  router.post("/reset-confirm", resetLimiter.middleware, async (req, res, next) => {
    try {
      const { token, password } = req.body ?? {};
      if (!token || !password) {
        throw validationError("Missing required fields", ["token", "password"]);
      }
      if (typeof token !== "string" || typeof password !== "string") {
        throw validationError("Invalid field types", ["token", "password"]);
      }
      if (password.length < PASSWORD_MIN_LENGTH) {
        throw validationError("Invalid field values", ["password"]);
      }
      const tokenHash = hashResetToken(token);

      const { rows } = await query(
        client,
        `SELECT pr.id, pr.user_id, pr.expires_at, pr.consumed_at
         FROM auth_password_reset pr
         WHERE pr.token_hash = $1`,
        [tokenHash]
      );
      const reset = rows[0];
      if (!reset) {
        throw new AppError("INVALID_RESET_TOKEN", 400, "Invalid or expired reset token");
      }
      if (reset.consumed_at) {
        throw new AppError("RESET_TOKEN_USED", 400, "Reset token already used");
      }
      if (new Date(reset.expires_at) < new Date()) {
        throw new AppError("RESET_TOKEN_EXPIRED", 400, "Reset token expired");
      }

      const newHash = await hashPassword(password);
      await query(
        client,
        `UPDATE auth_password
         SET password_hash = $2, password_algo = 'scrypt', password_set_at = now()
         WHERE user_id = $1`,
        [reset.user_id, newHash]
      );

      await query(
        client,
        `UPDATE auth_password_reset SET consumed_at = now() WHERE id = $1`,
        [reset.id]
      );

      return res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
