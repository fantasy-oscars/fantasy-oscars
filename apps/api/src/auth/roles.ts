import type { TokenClaims } from "./token.js";

export type AdminRole = "NONE" | "OPERATOR" | "SUPER_ADMIN";

export function normalizeAdminRole(input: unknown, isAdminFallback = false): AdminRole {
  const raw = typeof input === "string" ? input.trim().toUpperCase() : "";
  if (raw === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (raw === "OPERATOR") return "OPERATOR";
  return isAdminFallback ? "SUPER_ADMIN" : "NONE";
}

export function hasOperatorAccess(claims: TokenClaims | undefined): boolean {
  if (!claims) return false;
  const role = normalizeAdminRole(claims.admin_role, Boolean(claims.is_admin));
  return role === "OPERATOR" || role === "SUPER_ADMIN";
}

export function hasSuperAdminAccess(claims: TokenClaims | undefined): boolean {
  if (!claims) return false;
  const role = normalizeAdminRole(claims.admin_role, Boolean(claims.is_admin));
  return role === "SUPER_ADMIN";
}
