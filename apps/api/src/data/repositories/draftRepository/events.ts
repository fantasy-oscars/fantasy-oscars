import { DbClient, query } from "../../db.js";
import type { DraftEventRecord } from "./types.js";
import { incrementDraftVersion } from "./drafts.js";

export async function insertDraftEvent(
  client: DbClient,
  input: {
    draft_id: number;
    version: number;
    event_type: string;
    payload: unknown;
  }
): Promise<DraftEventRecord> {
  const { rows } = await query<DraftEventRecord>(
    client,
    `INSERT INTO draft_event (draft_id, version, event_type, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING
       id::int,
       draft_id::int,
       version::int,
       event_type,
       payload,
       created_at`,
    [input.draft_id, input.version, input.event_type, JSON.stringify(input.payload ?? {})]
  );
  return rows[0];
}

export async function createDraftEvent(
  client: DbClient,
  input: {
    draft_id: number;
    event_type: string;
    payload: unknown;
  }
): Promise<DraftEventRecord> {
  const version = await incrementDraftVersion(client, input.draft_id);
  return insertDraftEvent(client, {
    draft_id: input.draft_id,
    version,
    event_type: input.event_type,
    payload: input.payload
  });
}

