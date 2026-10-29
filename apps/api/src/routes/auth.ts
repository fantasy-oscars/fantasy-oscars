import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { authCookieConfig } from "../auth/cookie.js";
import { requireAllowedOrigin } from "../auth/middleware.js";
import { loginUserRateKey } from "./auth/loginRateKey.js";
import { createRateLimitGuard } from "../utils/rateLimitMiddleware.js";
import { registerAuthDeleteMeRoute } from "./auth/deleteMe.js";
import { registerAuthLoginRoute } from "./auth/login.js";
import { registerAuthLogoutRoute } from "./auth/logout.js";
import { registerAuthMeRoute } from "./auth/me.js";
import { registerAuthRegisterRoute } from "./auth/register.js";

// Register: per client IP.
const registerLimiter = createRateLimitGuard({
  windowMs: 60_000,
  max: 8
});

// Login: per client IP (broad) and per IP + username (tight, slows guessing a single account).
const loginIpLimiter = createRateLimitGuard({
  windowMs: 60_000,
  max: 30
});
const loginUserLimiter = createRateLimitGuard({
  windowMs: 60_000,
  max: 8,
  key: loginUserRateKey
});

export function createAuthRouter(
  client: DbClient,
  opts: { authSecret: string; corsAllowedOrigins: string[] }
): Router {
  const router = express.Router();
  const { authSecret } = opts;
  const cookieConfig = authCookieConfig();
  // Same allow-list the CORS middleware uses.
  const originGuard = requireAllowedOrigin(opts.corsAllowedOrigins);

  // Auth responses carry credentials or session state; never cache them.
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  registerAuthMeRoute({ router, client, authSecret });
  registerAuthLogoutRoute({ router, client, authSecret, cookieConfig, originGuard });
  registerAuthDeleteMeRoute({ router, client, authSecret, cookieConfig, originGuard });
  registerAuthRegisterRoute({ router, client, authLimiter: registerLimiter });
  registerAuthLoginRoute({
    router,
    client,
    authSecret,
    cookieConfig,
    loginLimiters: [loginIpLimiter, loginUserLimiter]
  });

  return router;
}
