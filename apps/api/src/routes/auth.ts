import express from "express";
import crypto from "crypto";
import { DbClient, query } from "../data/db.js";
import { AppError, validationError } from "../errors.js";
import { signToken } from "../auth/token.js";
import { requireAuth, AuthedRequest } from "../auth/middleware.js";

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

      const password_hash = crypto.createHash("sha256").update(password).digest("hex");
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

      const hash = crypto.createHash("sha256").update(password).digest("hex");
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

  return router;
}
