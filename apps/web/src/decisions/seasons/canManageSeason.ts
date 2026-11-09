type RoleHolder = { user_id: number; role: string };

const COMMISSIONER_ROLES = new Set(["OWNER", "CO_OWNER"]);

/**
 * Whether the viewer may call the commissioner-only season endpoints (invites,
 * league roster). Decided from data every season member can already read, so the
 * restricted requests are only made when they will succeed.
 */
export function canManageSeason(args: {
  userId: number;
  seasonMembers: RoleHolder[];
  leagueMembers?: RoleHolder[];
  isSuperAdmin: boolean;
}): boolean {
  if (args.isSuperAdmin) return true;
  if (!Number.isFinite(args.userId)) return false;
  const holdsRole = (members: RoleHolder[]) =>
    members.some((m) => m.user_id === args.userId && COMMISSIONER_ROLES.has(m.role));
  return holdsRole(args.seasonMembers) || holdsRole(args.leagueMembers ?? []);
}
