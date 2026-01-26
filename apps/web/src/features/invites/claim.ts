import { fetchJson } from "../../lib/api";

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

export async function acceptInvite(token: string) {
  const res = await fetchJson<{ invite?: { season_id?: number } }>(
    `/seasons/invites/${token}/accept`,
    { method: "POST" }
  );
  if (!res.ok) {
    return { ok: false as const, message: mapInviteError(res.errorCode, res.error) };
  }
  return {
    ok: true as const,
    message: "Invite accepted",
    seasonId: res.data?.invite?.season_id
  };
}

export async function declineInvite(token: string) {
  const res = await fetchJson(`/seasons/invites/${token}/decline`, { method: "POST" });
  return {
    ok: res.ok as boolean,
    message: res.ok ? "Invite declined" : (res.error ?? "Decline failed")
  };
}
