import type { Response } from "express";
import { parseAuthCookieSameSite, type AuthCookieSameSite } from "../config/env.js";

export type AuthCookieConfig = {
  name: string;
  sameSite: AuthCookieSameSite;
  httpOnly: boolean;
  secure: boolean;
  path: "/";
};

export function authCookieConfig(env: NodeJS.ProcessEnv = process.env): AuthCookieConfig {
  // Cross-origin deployments (web and API on different sites, e.g.
  // https://www.fantasy-oscars.com -> https://fantasy-oscars-api-prod.onrender.com)
  // need SameSite=None; Secure=true, which is the production default. A same-origin
  // deployment sets AUTH_COOKIE_SAMESITE=lax.
  const isProd = env.NODE_ENV === "production";
  return {
    name: "auth_token",
    sameSite: parseAuthCookieSameSite(env.AUTH_COOKIE_SAMESITE, isProd),
    httpOnly: true,
    secure: isProd,
    path: "/"
  };
}

export function setAuthCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  config: AuthCookieConfig = authCookieConfig()
) {
  res.cookie(config.name, token, {
    httpOnly: config.httpOnly,
    sameSite: config.sameSite,
    secure: config.secure,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    path: config.path
  });
}

export function clearAuthCookie(
  res: Response,
  config: AuthCookieConfig = authCookieConfig()
) {
  res.clearCookie(config.name, {
    httpOnly: config.httpOnly,
    sameSite: config.sameSite,
    secure: config.secure,
    path: config.path
  });
}
