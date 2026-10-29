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

/** Parses a `Cookie` request header into name -> value (first occurrence wins). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (!key || key in out) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}
