import type { Namespace } from "socket.io";
import type { DbClient } from "../data/db.js";
import { query } from "../data/db.js";
import { emitToDraft } from "./draftNamespace.js";

type CeremonyWinnersUpdatedPayload = {
  ceremony_id: number;
  category_edition_id: number;
  nomination_ids: number[];
  created_at: string;
};

type CeremonyFinalizedPayload = {
  ceremony_id: number;
  status: "COMPLETE";
  created_at: string;
};

let draftNamespace: Namespace | null = null;

export function registerCeremonyEventEmitter(nsp: Namespace) {
  draftNamespace = nsp;
}

export function clearCeremonyEventEmitter() {
  draftNamespace = null;
}

async function listDraftIdsByCeremony(db: DbClient, ceremonyId: number): Promise<number[]> {
  const { rows } = await query<{ id: number }>(
    db,
    `
      SELECT d.id::int AS id
      FROM draft d
      JOIN season s ON s.id = d.season_id
      WHERE s.ceremony_id = $1
    `,
    [ceremonyId]
  );
  return rows.map((r) => r.id);
}

export async function emitCeremonyWinnersUpdated(args: {
  db: DbClient;
  ceremonyId: number;
  categoryEditionId: number;
  nominationIds: number[];
}) {
  if (!draftNamespace) return;
  const draftIds = await listDraftIdsByCeremony(args.db, args.ceremonyId);
  const payload: CeremonyWinnersUpdatedPayload = {
    ceremony_id: args.ceremonyId,
    category_edition_id: args.categoryEditionId,
    nomination_ids: args.nominationIds,
    created_at: new Date().toISOString()
  };
  for (const draftId of draftIds) {
    emitToDraft(draftNamespace, draftId, "ceremony:winners.updated", payload);
  }
}

export async function emitCeremonyFinalized(args: { db: DbClient; ceremonyId: number }) {
  if (!draftNamespace) return;
  const draftIds = await listDraftIdsByCeremony(args.db, args.ceremonyId);
  const payload: CeremonyFinalizedPayload = {
    ceremony_id: args.ceremonyId,
    status: "COMPLETE",
    created_at: new Date().toISOString()
  };
  for (const draftId of draftIds) {
    emitToDraft(draftNamespace, draftId, "ceremony:finalized", payload);
  }
}

