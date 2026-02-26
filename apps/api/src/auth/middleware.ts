import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors.js";
import { query } from "../data/db.js";
import { TokenClaims, verifyToken } from "./token.js";
import { hasOperatorAccess, hasSuperAdminAccess, normalizeAdminRole } from "./roles.js";

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
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      return next(new AppError("UNAUTHORIZED", 401, "Missing auth token"));
    }
    try {
      req.auth = verifyToken(token, secret);
      // If a token is valid but the user no longer exists (e.g. DB reset),
      // treat it as an expired session instead of letting downstream FKs 500.
      const sub = req.auth?.sub;
      const userId = sub ? Number(sub) : NaN;
      const db = (req.app as unknown as { locals?: { db?: unknown } })?.locals?.db;
      if (db && Number.isInteger(userId) && userId > 0) {
        let rows: Array<{ id: number; is_admin: boolean; admin_role?: string | null }> =
          [];
        try {
          const res = await query<{
            id: number;
            is_admin: boolean;
            admin_role: string | null;
          }>(
            db as never,
            `SELECT id::int, is_admin, admin_role
             FROM app_user
             WHERE id = $1
               AND deleted_at IS NULL`,
            [userId]
          );
          rows = res.rows;
        } catch (err) {
          const pgErr = err as { code?: string; message?: string };
          const missingAdminRole =
            pgErr.code === "42703" &&
            String(pgErr.message ?? "")
              .toLowerCase()
              .includes("admin_role");
          if (!missingAdminRole) throw err;
          const res = await query<{ id: number; is_admin: boolean }>(
            db as never,
            `SELECT id::int, is_admin
             FROM app_user
             WHERE id = $1
               AND deleted_at IS NULL`,
            [userId]
          );
          rows = res.rows;
        }

        if (!rows[0]) {
          // Clear auth cookie if present; bearer-token callers can ignore.
          res.setHeader(
            "Set-Cookie",
            "auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
          );
          return next(
            new AppError(
              "UNAUTHORIZED",
              401,
              "Your session has expired. Please log in again."
            )
          );
        }

        // Use the database as the source of truth for admin role so permission
        // changes take effect immediately without forcing a logout/login cycle.
        const role = normalizeAdminRole(rows[0].admin_role, Boolean(rows[0].is_admin));
        req.auth.is_admin = role !== "NONE";
        req.auth.admin_role = role;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireAdmin() {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!hasOperatorAccess(req.auth)) {
      return next(new AppError("FORBIDDEN", 403, "Operator access required"));
    }
    return next();
  };
}

export function requireSuperAdmin() {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!hasSuperAdminAccess(req.auth)) {
      return next(new AppError("FORBIDDEN", 403, "Super admin access required"));
    }
    return next();
  };
}

export const authUtils = {
  extractToken
};
