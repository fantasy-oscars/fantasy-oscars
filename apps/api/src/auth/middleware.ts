import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors.js";
import { TokenClaims, verifyToken } from "./token.js";

export type AuthedRequest = Request & { auth?: TokenClaims };

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [k, ...rest] = part.split("=");
    if (!k) return acc;
    const key = k.trim();
    if (!key) return acc;
    acc[key] = rest.join("=").trim();
    return acc;
  }, {});
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization ?? "";
  if (header.startsWith("Bearer ")) return header.slice("Bearer ".length);
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.auth_token) return cookies.auth_token;
  return null;
}

export function requireAuth(secret: string) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      return next(new AppError("UNAUTHORIZED", 401, "Missing auth token"));
    }
    try {
      req.auth = verifyToken(token, secret);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireAdmin() {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.auth?.is_admin) {
      return next(new AppError("FORBIDDEN", 403, "Admin access required"));
    }
    return next();
  };
}

export const authUtils = {
  extractToken
};
