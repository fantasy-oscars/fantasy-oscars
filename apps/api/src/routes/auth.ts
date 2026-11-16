import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { authCookieConfig } from "../auth/cookie.js";
import { requireAllowedOrigin } from "../auth/middleware.js";
import { loginUserRateKey } from "./auth/loginRateKey.js";
import { passwordResetEmailRateKey } from "./auth/passwordResetRateKey.js";
import type { Mailer } from "../services/mail/mailer.js";
import { createRateLimitGuard } from "../utils/rateLimitMiddleware.js";
import { registerAuthAccountChangeRoutes } from "./auth/accountChanges.js";
import { registerAuthDeleteMeRoute } from "./auth/deleteMe.js";
import { registerAuthLoginRoute } from "./auth/login.js";
import { registerAuthLogoutRoute } from "./auth/logout.js";
import { registerAuthMeRoute } from "./auth/me.js";
import { registerAuthPasswordResetRoutes } from "./auth/passwordReset.js";
import { registerAuthPreferencesRoute } from "./auth/preferences.js";
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

const FIFTEEN_MINUTES_MS = 15 * 60_000;

// Reset request: per client IP, and per address across all IPs (each request can send an email).
const resetRequestIpLimiter = createRateLimitGuard({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10
});
const resetRequestEmailLimiter = createRateLimitGuard({
  windowMs: 60 * 60_000,
  max: 3,
  key: passwordResetEmailRateKey
});

// Reset confirm: per client IP.
const resetConfirmLimiter = createRateLimitGuard({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10
});

// Password and email changes check the current password: per client IP.
const accountChangeLimiter = createRateLimitGuard({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10
});

export function createAuthRouter(
  client: DbClient,
  opts: {
    authSecret: string;
    corsAllowedOrigins: string[];
    mailer: Mailer;
    webBaseUrl: string;
  }
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
  registerAuthPreferencesRoute({ router, client, authSecret, originGuard });
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
  registerAuthPasswordResetRoutes({
    router,
    client,
    mailer: opts.mailer,
    webBaseUrl: opts.webBaseUrl,
    requestLimiters: [resetRequestIpLimiter, resetRequestEmailLimiter],
    confirmLimiter: resetConfirmLimiter
  });
  registerAuthAccountChangeRoutes({
    router,
    client,
    authSecret,
    originGuard,
    limiter: accountChangeLimiter
  });

  return router;
}
