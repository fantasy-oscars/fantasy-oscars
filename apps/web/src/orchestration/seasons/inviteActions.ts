import { fetchJson } from "../../lib/api";
import type { SeasonInvite } from "../../lib/types";

export async function postSeasonUserInvite(
  seasonId: number,
  input: { user_id: number } | { username: string }
) {
  return fetchJson(`/seasons/${seasonId}/user-invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function postSeasonInvite(seasonId: number, input: { label?: string } = {}) {
  return fetchJson<{ invite: SeasonInvite; token: string }>(
    `/seasons/${seasonId}/invites`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}

export async function postRevokeSeasonInvite(seasonId: number, inviteId: number) {
  return fetchJson<{ invite: SeasonInvite }>(
    `/seasons/${seasonId}/invites/${inviteId}/revoke`,
    {
      method: "POST"
    }
  );
}

export async function postRegenerateSeasonInvite(seasonId: number, inviteId: number) {
  return fetchJson<{ invite: SeasonInvite; token: string }>(
    `/seasons/${seasonId}/invites/${inviteId}/regenerate`,
    { method: "POST" }
  );
}

export async function patchSeasonInviteLabel(
  seasonId: number,
  inviteId: number,
  label: string
) {
  return fetchJson<{ invite: SeasonInvite }>(`/seasons/${seasonId}/invites/${inviteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: label.trim() || null })
  });
}
