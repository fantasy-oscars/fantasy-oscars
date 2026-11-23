import type { AuthedRequest } from "../../auth/middleware.js";

/** The admin making a Circuit or ceremony-date write, for the audit log. */
export function actorOf(req: AuthedRequest) {
  return { actorUserId: req.auth?.sub ? Number(req.auth.sub) : null };
}

/** True when the admin confirmed a change that affects initialised leagues (`?confirm=true`). */
export function confirmedOf(req: AuthedRequest): boolean {
  return req.query?.confirm === "true";
}
