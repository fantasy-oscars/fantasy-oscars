import type { AuthedRequest } from "../../auth/middleware.js";

/** The admin making a Series or ceremony-date write, for the audit log. */
export function actorOf(req: AuthedRequest) {
  return { actorUserId: req.auth?.sub ? Number(req.auth.sub) : null };
}
