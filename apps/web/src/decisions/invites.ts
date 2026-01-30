export function mapInviteError(code?: string, fallback?: string) {
  switch (code) {
    case "SEASON_CANCELLED":
      return "This season was cancelled. Invites cannot be claimed.";
    case "INVITE_REVOKED":
      return "This invite was revoked. Ask the commissioner for a new link.";
    case "INVITE_NOT_FOUND":
      return "Invite not found or already claimed.";
    default:
      return fallback ?? "Invite is invalid or expired";
  }
}
