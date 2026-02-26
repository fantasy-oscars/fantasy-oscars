export type AdminRole = "NONE" | "OPERATOR" | "SUPER_ADMIN";

export function normalizeAdminRole(input: unknown, isAdminFallback = false): AdminRole {
  const raw = typeof input === "string" ? input.trim().toUpperCase() : "";
  if (raw === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (raw === "OPERATOR") return "OPERATOR";
  return isAdminFallback ? "SUPER_ADMIN" : "NONE";
}

export function hasOperatorAccess(
  user: { admin_role?: unknown; is_admin?: boolean } | null
) {
  if (!user) return false;
  const role = normalizeAdminRole(user.admin_role, Boolean(user.is_admin));
  return role === "OPERATOR" || role === "SUPER_ADMIN";
}

export function hasSuperAdminAccess(
  user: { admin_role?: unknown; is_admin?: boolean } | null
) {
  if (!user) return false;
  const role = normalizeAdminRole(user.admin_role, Boolean(user.is_admin));
  return role === "SUPER_ADMIN";
}
