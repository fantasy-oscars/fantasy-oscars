import type { Response } from "express";

export type AuthCookieConfig = {
  name: string;
  sameSite: "lax" | "none";
  httpOnly: boolean;
  secure: boolean;
  path: "/";
};

export function authCookieConfig(): AuthCookieConfig {
  // In production, the web app and API are on different sites (e.g.
  // https://www.fantasy-oscars.com -> https://fantasy-oscars-api-prod.onrender.com),
  // so the auth cookie must be SameSite=None; Secure=true to be sent on fetch/XHR.
  const isProd = process.env.NODE_ENV === "production";
  return {
    name: "auth_token",
    sameSite: isProd ? "none" : "lax",
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
