import express from "express";
import crypto from "crypto";
import { DbClient, query } from "../data/db.js";
import { AppError, validationError } from "../errors.js";
import { signToken } from "../auth/token.js";
import { requireAuth, AuthedRequest } from "../auth/middleware.js";

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
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

      const password_hash = hashPassword(password);
      const password_algo = "sha256";

      try {
        const { rows } = await query(
          client,
          `INSERT INTO app_user (handle, email, display_name)
           VALUES ($1, $2, $3)
           RETURNING id, handle, email, display_name, created_at`,
          [handle, email, display_name]
        );

        const user = rows[0];
        await query(
          client,
          `INSERT INTO auth_password (user_id, password_hash, password_algo) VALUES ($1, $2, $3)`,
          [user.id, password_hash, password_algo]
        );

        return res.status(201).json({ user });
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (msg.includes("app_user_handle_key") || msg.includes("app_user_email_key")) {
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

      const { rows } = await query(
        client,
        `SELECT u.id, u.handle, u.email, u.display_name, p.password_hash
         FROM app_user u
         JOIN auth_password p ON p.user_id = u.id
         WHERE u.handle = $1`,
        [handle]
      );

      const user = rows[0];
      if (!user) throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");

      const hash = hashPassword(password);
      if (hash !== user.password_hash) {
        throw new AppError("INVALID_CREDENTIALS", 401, "Invalid credentials");
      }

      // Skeleton: return placeholder token (non-secure) for v0.
      const token = signToken(
        { sub: String(user.id), handle: user.handle },
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
          display_name: user.display_name
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

      const { rows } = await query(
        client,
        `SELECT id, handle FROM app_user WHERE email = $1`,
        [email]
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

  router.post("/reset-confirm", async (req, res, next) => {
    try {
      const { token, password } = req.body ?? {};
      if (!token || !password) {
        throw validationError("Missing required fields", ["token", "password"]);
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

      const newHash = hashPassword(password);
      await query(
        client,
        `UPDATE auth_password
         SET password_hash = $2, password_algo = 'sha256', password_set_at = now()
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
