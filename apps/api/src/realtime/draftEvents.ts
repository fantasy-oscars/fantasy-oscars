import type { Namespace } from "socket.io";
import { emitToDraft } from "./draftNamespace.js";
import type { DraftEventRecord } from "../data/repositories/draftRepository.js";

export type DraftEventMessage = {
  draft_id: number;
  version: number;
  event_type: string;
  payload: unknown;
  created_at: string;
};

type DraftEventEmitter = (event: DraftEventMessage) => void;

let emitter: DraftEventEmitter | null = null;

export function registerDraftEventEmitter(nsp: Namespace) {
  emitter = (event) => {
    emitToDraft(nsp, event.draft_id, "draft:event", event);
  };
}

export function clearDraftEventEmitter() {
  emitter = null;
}

export function emitDraftEvent(event: DraftEventRecord) {
  if (!emitter) return;
  emitter({
    draft_id: event.draft_id,
    version: event.version,
    event_type: event.event_type,
    payload: event.payload,
    created_at: event.created_at.toISOString()
  });
}
