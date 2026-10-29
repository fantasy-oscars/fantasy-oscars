import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors.js";
import type { DbClient } from "../data/db.js";
import {
  getActiveSessionUser,
  renewAuthSession
} from "../data/repositories/authSessionRepository.js";
import {
  AUTH_SESSION_MAX_AGE_MS,
  AUTH_SESSION_RENEW_AFTER_MS,
  AUTH_SESSION_TTL_MS,
  shouldRenewAuthSession
} from "../domain/authSession.js";
import { clearAuthCookie, parseCookies, setAuthCookie } from "./cookie.js";
import { TokenClaims, signSessionToken, verifyToken } from "./token.js";
import { hasOperatorAccess, hasSuperAdminAccess, normalizeAdminRole } from "./roles.js";

export type AuthedRequest = Request & {
  auth?: TokenClaims;
  /** The validated server-side session behind `auth` (set when a DB is attached). */
  authSession?: { id: string; expires_at: Date };
};

/** Both credential transports; either may be absent. */
function extractTokens(req: Request): { bearer: string | null; cookie: string | null } {
  const header = req.headers.authorization ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const cookie = parseCookies(req.headers.cookie).auth_token || null;
  return { bearer: bearer || null, cookie };
}

/** The credential used for auth: the Bearer header wins over the cookie. */
function extractToken(
  req: Request
): { token: string; source: "bearer" | "cookie" } | null {
  const { bearer, cookie } = extractTokens(req);
  if (bearer) return { token: bearer, source: "bearer" };
  if (cookie) return { token: cookie, source: "cookie" };
  return null;
}

function sessionExpired() {
  return new AppError(
    "UNAUTHORIZED",
    401,
    "Your session has expired. Please log in again."
  );
}

export function requireAuth(secret: string) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const credential = extractToken(req);
    if (!credential) {
      return next(new AppError("UNAUTHORIZED", 401, "Missing auth token"));
    }
    // Only clear the cookie when the cookie itself is what was rejected.
    const rejectSession = () => {
      if (credential.source === "cookie") clearAuthCookie(res);
      return next(sessionExpired());
    };
    try {
      const claims = verifyToken(credential.token, secret);
      const userId = Number(claims.sub);
      // Tokens issued before server-side sessions carry no `sid`; the user
      // simply logs in again.
      if (!claims.sid || typeof claims.sid !== "string") {
        return rejectSession();
      }
      if (!Number.isInteger(userId) || userId <= 0) {
        return next(new AppError("UNAUTHORIZED", 401, "Invalid token"));
      }
      req.auth = claims;

      const db = (req.app as unknown as { locals?: { db?: DbClient } })?.locals?.db;
      if (db) {
        // One round trip: the session must be live and the user not deleted.
        const session = await getActiveSessionUser(db, {
          sessionId: claims.sid,
          userId,
          maxAgeMs: AUTH_SESSION_MAX_AGE_MS
        });
        if (!session) return rejectSession();

        // Use the database as the source of truth for admin role so permission
        // changes take effect immediately without forcing a logout/login cycle.
        const role = normalizeAdminRole(session.admin_role, Boolean(session.is_admin));
        req.auth.is_admin = role !== "NONE";
        req.auth.admin_role = role;
        req.authSession = { id: claims.sid, expires_at: new Date(session.expires_at) };

        // Sliding expiry: at most one write per session per renewal interval.
        if (shouldRenewAuthSession(new Date(session.last_seen_at))) {
          const renewedUntil = await renewAuthSession(db, {
            sessionId: claims.sid,
            ttlMs: AUTH_SESSION_TTL_MS,
            renewAfterMs: AUTH_SESSION_RENEW_AFTER_MS,
            maxAgeMs: AUTH_SESSION_MAX_AGE_MS
          });
          if (renewedUntil) {
            const expiresAt = new Date(renewedUntil);
            req.authSession.expires_at = expiresAt;
            const fresh = signSessionToken(
              { ...req.auth, sid: claims.sid },
              secret,
              expiresAt
            );
            setAuthCookie(res, fresh, expiresAt);
          }
        }
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

/**
 * CSRF guard for cookie-authenticated, state-changing routes: a browser request
 * from an origin outside the CORS allow-list is refused. Requests without an
 * Origin header (non-browser clients) are allowed.
 */
export function requireAllowedOrigin(allowedOrigins: readonly string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      return next(new AppError("FORBIDDEN", 403, "Origin not allowed"));
    }
    return next();
  };
}

export const authUtils = {
  extractToken,
  extractTokens
};
