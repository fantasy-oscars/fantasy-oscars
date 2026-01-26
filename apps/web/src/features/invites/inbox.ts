import { fetchJson } from "../../lib/api";
import type { InboxInvite, SeasonMeta } from "../../lib/types";

export async function fetchInboxInvites() {
  return fetchJson<{ invites: InboxInvite[] }>("/seasons/invites/inbox", {
    method: "GET"
  });
}

export async function acceptInboxInvite(inviteId: number) {
  return fetchJson(`/seasons/invites/${inviteId}/accept`, { method: "POST" });
}

export async function declineInboxInvite(inviteId: number) {
  return fetchJson(`/seasons/invites/${inviteId}/decline`, { method: "POST" });
}

export async function resolveInviteDestination(invite: InboxInvite) {
  // Try to navigate to season if extant; otherwise league fallback.
  if (invite.league_id) {
    const seasonsRes = await fetchJson<{ seasons: SeasonMeta[] }>(
      `/leagues/${invite.league_id}/seasons`,
      { method: "GET" }
    );
    if (seasonsRes.ok) {
      const seasonMeta = (seasonsRes.data?.seasons ?? []).find(
        (s) => s.id === invite.season_id
      );
      if (seasonMeta && seasonMeta.status === "EXTANT") {
        return `/seasons/${invite.season_id}`;
      }
    }
    return `/leagues/${invite.league_id}`;
  }
  return "/leagues";
}
