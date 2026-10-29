import type express from "express";
import { clearAuthCookie, type AuthCookieConfig } from "../../auth/cookie.js";
import { authUtils } from "../../auth/middleware.js";
import { verifyToken } from "../../auth/token.js";
import type { DbClient } from "../../data/db.js";
import { revokeAuthSession } from "../../data/repositories/authSessionRepository.js";

export function registerAuthLogoutRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
  cookieConfig: AuthCookieConfig;
  originGuard: express.RequestHandler;
}) {
  const { router, client, authSecret, cookieConfig, originGuard } = args;

  router.post("/logout", originGuard, async (req, res, next) => {
    try {
      // Logout always succeeds. Every valid token presented (Bearer header
      // and/or cookie) has its session revoked so it stops working everywhere.
      const { bearer, cookie } = authUtils.extractTokens(req);
      for (const token of new Set([bearer, cookie])) {
        if (!token) continue;
        let claims: ReturnType<typeof verifyToken>;
        try {
          claims = verifyToken(token, authSecret);
        } catch {
          continue;
        }
        const userId = Number(claims.sub);
        if (claims.sid && Number.isInteger(userId) && userId > 0) {
          await revokeAuthSession(client, { sessionId: claims.sid, userId });
        }
      }
      clearAuthCookie(res, cookieConfig);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}
