import express from "express";
import crypto from "crypto";
import { DbClient, query } from "../data/db.js";
import { AppError, validationError } from "../errors.js";
import { signToken } from "../auth/token.js";
import { loadResetEmailConfig, sendPasswordResetEmail } from "../email/resetEmail.js";
import { requireAuth, AuthedRequest } from "../auth/middleware.js";

const PASSWORD_MIN_LENGTH = 8;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

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

export function createAuthRouter(client: DbClient, opts: { authSecret: string }) {
  const router = express.Router();
  const { authSecret } = opts;
  const isProd = process.env.NODE_ENV === "production";
  const cookieConfig = {
    name: "auth_token",
    maxAgeMs: 60 * 60 * 1000, // 1 hour
    sameSite: "lax" as const,
    httpOnly: true,
    secure: isProd,
    path: "/" as const
  };

  router.post("/register", async (req, res, next) => {
    try {
      const { handle, email, display_name, password } = req.body ?? {};
      if (!handle || !email || !display_name || !password) {
        throw validationError("Missing required fields", [
          "handle",
          "email",
          "display_name",
          "password"
        ]);
      }
      if (
        typeof handle !== "string" ||
        typeof email !== "string" ||
        typeof display_name !== "string" ||
        typeof password !== "string"
      ) {
        throw validationError("Invalid field types", [
          "handle",
          "email",
          "display_name",
          "password"
        ]);
      }
      const trimmedHandle = handle.trim();
      const trimmedEmail = email.trim();
      const normalizedHandle = trimmedHandle.toLowerCase();
      const normalizedEmail = trimmedEmail.toLowerCase();
      const trimmedDisplayName = display_name.trim();
      const invalidFields: string[] = [];
      if (trimmedHandle.length < 2 || /\s/.test(trimmedHandle)) {
        invalidFields.push("handle");
      }
      if (trimmedEmail.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        invalidFields.push("email");
      }
      if (trimmedDisplayName.length < 1) invalidFields.push("display_name");
      if (password.length < PASSWORD_MIN_LENGTH) invalidFields.push("password");
      if (invalidFields.length) {
        throw validationError("Invalid field values", invalidFields);
      }

      const password_hash = await hashPassword(password);
      const password_algo = "scrypt";

      try {
        const { rows } = await query(
          client,
          `INSERT INTO app_user (handle, email, display_name)
           VALUES ($1, $2, $3)
           RETURNING id, handle, email, display_name, created_at, is_admin`,
          [normalizedHandle, normalizedEmail, trimmedDisplayName]
        );

        const user = rows[0];
        await query(
          client,
          `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
          [user.id, password_hash, password_algo]
        );

        return res.status(201).json({ user });
      } catch (err) {
        const pgErr = err as { constraint?: string; message?: string };
        const constraint = pgErr.constraint ?? pgErr.message ?? "";
        if (
          constraint.includes("app_user_handle_key") ||
          constraint.includes("app_user_email_key") ||
          constraint.includes("app_user_handle_lower_key") ||
          constraint.includes("app_user_email_lower_key")
        ) {
          throw new AppError("USER_EXISTS", 409, "User with handle/email already exists");
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const { handle, password } = req.body ?? {};
      if (!handle || !password) {
        throw validationError("Missing required fields", ["handle", "password"]);
      }
      if (typeof handle !== "string" || typeof password !== "string") {
        throw validationError("Invalid field types", ["handle", "password"]);
      }
      if (handle.trim().length < 2 || password.length < PASSWORD_MIN_LENGTH) {
        throw validationError("Invalid credentials", ["handle", "password"]);
      }

      const normalizedHandle = handle.trim().toLowerCase();
      const { rows } = await query(
        client,
        `SELECT u.id, u.handle, u.email, u.display_name, u.is_admin, p.password_hash, p.password_algo
         FROM app_user u
         JOIN auth_password p ON p.user_id = u.id
         WHERE lower(u.handle) = $1`,
        [normalizedHandle]
      );

      const user = rows[0];
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
        { sub: String(user.id), handle: user.handle, is_admin: user.is_admin },
        authSecret,
        60 * 60
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
          handle: user.handle,
          email: user.email,
          display_name: user.display_name,
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

  router.post("/reset-request", async (req, res, next) => {
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
        `SELECT id, handle FROM app_user WHERE email = $1`,
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
        const emailCfg = loadResetEmailConfig();
        await sendPasswordResetEmail(emailCfg, { to: normalizedEmail, token: rawToken });
        return res.status(200).json({ ok: true, delivery: "email" });
      }

      // Dev/test: return token directly
      return res.status(200).json({ ok: true, delivery: "inline", token: rawToken });
    } catch (err) {
      next(err);
    }
  });

  router.post("/reset-confirm", async (req, res, next) => {
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
