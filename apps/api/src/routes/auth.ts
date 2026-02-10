import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { createRateLimitGuard } from "../utils/rateLimitMiddleware.js";
import { registerAuthLoginRoute } from "./auth/login.js";
import type { AuthCookieConfig } from "./auth/logout.js";
import { registerAuthLogoutRoute } from "./auth/logout.js";
import { registerAuthMeRoute } from "./auth/me.js";
import { registerAuthRegisterRoute } from "./auth/register.js";

const authLimiter = createRateLimitGuard({
  windowMs: 60_000,
  max: 8
});

export function createAuthRouter(client: DbClient, opts: { authSecret: string }): Router {
  const router = express.Router();
  const { authSecret } = opts;
  const isProd = process.env.NODE_ENV === "production";
  // Dogfooding preference: keep sessions long-lived to avoid "random" logouts.
  // NOTE: This is a single JWT in an HttpOnly cookie (no refresh/rotation yet),
  // so shortening this (or adding refresh tokens) is recommended before go-live.
  const AUTH_COOKIE_TTL_DAYS = 90;
  const authCookieMaxAgeMs = AUTH_COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;
  // In production, the web app and API are on different sites (e.g.
  // https://www.fantasy-oscars.com -> https://fantasy-oscars-api-prod.onrender.com),
  // so the auth cookie must be SameSite=None; Secure=true to be sent on fetch/XHR.
  const cookieSameSite = isProd ? ("none" as const) : ("lax" as const);
  const cookieSecure = isProd ? true : false;
  const cookieConfig: AuthCookieConfig = {
    name: "auth_token",
    sameSite: cookieSameSite,
    httpOnly: true,
    secure: cookieSecure,
    path: "/" as const
  };

  registerAuthMeRoute({ router, client, authSecret });
  registerAuthLogoutRoute({ router, cookieConfig });
  registerAuthRegisterRoute({ router, client, authLimiter });
  registerAuthLoginRoute({
    router,
    client,
    authSecret,
    authCookieMaxAgeMs,
    cookieConfig,
    authLimiter
  });

  return router;
}

