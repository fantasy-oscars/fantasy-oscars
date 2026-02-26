import type { AuthedRequest } from "../../auth/middleware.js";
import { hasSuperAdminAccess, normalizeAdminRole } from "../../auth/roles.js";
import { AppError } from "../../errors.js";

const OPERATOR_STATIC_KEYS = new Set(["landing_blurb"]);
const OPERATOR_DYNAMIC_KEYS = new Set(["home_main", "banner"]);

export function assertStaticContentAccess(req: AuthedRequest, key: string): void {
  if (hasSuperAdminAccess(req.auth)) return;
  const role = normalizeAdminRole(req.auth?.admin_role, Boolean(req.auth?.is_admin));
  if (role === "OPERATOR" && OPERATOR_STATIC_KEYS.has(key)) return;
  throw new AppError("FORBIDDEN", 403, "Super admin access required for this content");
}

export function assertDynamicContentAccess(req: AuthedRequest, key: string): void {
  if (hasSuperAdminAccess(req.auth)) return;
  const role = normalizeAdminRole(req.auth?.admin_role, Boolean(req.auth?.is_admin));
  if (role === "OPERATOR" && OPERATOR_DYNAMIC_KEYS.has(key)) return;
  throw new AppError("FORBIDDEN", 403, "Super admin access required for this content");
}
