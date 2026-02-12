import { fetchJson } from "../../lib/api";

export async function postDraftPick(args: {
  draftId: number;
  nominationId: number;
  requestId: string;
}) {
  return fetchJson(`/drafts/${args.draftId}/picks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nomination_id: args.nominationId,
      request_id: args.requestId
    })
  });
}

export async function postDraftStart(draftId: number) {
  return fetchJson(`/drafts/${draftId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
}

export async function postDraftPause(draftId: number) {
  return fetchJson(`/drafts/${draftId}/pause`, { method: "POST" });
}

export async function postDraftResume(draftId: number) {
  return fetchJson(`/drafts/${draftId}/resume`, { method: "POST" });
}
