import type { DbClient } from "../db.js";
import { query } from "../db.js";

export type DraftAutodraftStrategy = "RANDOM" | "PLAN";

export type DraftAutodraftConfig = {
  enabled: boolean;
  strategy: DraftAutodraftStrategy;
  plan_id: number | null;
  updated_at?: Date;
};

export async function getDraftAutodraftConfig(
  client: DbClient,
  input: { draft_id: number; user_id: number }
): Promise<DraftAutodraftConfig | null> {
  const { rows } = await query<{
    enabled: boolean;
    strategy: DraftAutodraftStrategy;
    plan_id: number | null;
    updated_at: Date;
  }>(
    client,
    `
      SELECT enabled, strategy, plan_id::int, updated_at
      FROM draft_autodraft
      WHERE draft_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [input.draft_id, input.user_id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    enabled: Boolean(row.enabled),
    strategy: row.strategy ?? "RANDOM",
    plan_id: row.plan_id ?? null,
    updated_at: row.updated_at
  };
}

export async function upsertDraftAutodraftConfig(
  client: DbClient,
  input: { draft_id: number; user_id: number } & DraftAutodraftConfig
): Promise<DraftAutodraftConfig> {
  const { rows } = await query<{
    enabled: boolean;
    strategy: DraftAutodraftStrategy;
    plan_id: number | null;
    updated_at: Date;
  }>(
    client,
    `
      INSERT INTO draft_autodraft (draft_id, user_id, enabled, strategy, plan_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (draft_id, user_id)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        strategy = EXCLUDED.strategy,
        plan_id = EXCLUDED.plan_id,
        updated_at = now()
      RETURNING enabled, strategy, plan_id::int, updated_at
    `,
    [
      input.draft_id,
      input.user_id,
      Boolean(input.enabled),
      input.strategy ?? "RANDOM",
      input.plan_id ?? null
    ]
  );
  const row = rows[0];
  return {
    enabled: Boolean(row.enabled),
    strategy: row.strategy ?? "RANDOM",
    plan_id: row.plan_id ?? null,
    updated_at: row.updated_at
  };
}

export async function listDraftPlanNominationIdsForUserCeremony(
  client: DbClient,
  input: { plan_id: number; user_id: number; ceremony_id: number }
): Promise<number[]> {
  const { rows } = await query<{ nomination_id: number }>(
    client,
    `
      SELECT dpi.nomination_id::int
      FROM draft_plan_item dpi
      JOIN draft_plan dp ON dp.id = dpi.plan_id
      WHERE dp.id = $1 AND dp.user_id = $2 AND dp.ceremony_id = $3
      ORDER BY dpi.sort_index ASC, dpi.id ASC
    `,
    [input.plan_id, input.user_id, input.ceremony_id]
  );
  return rows.map((r) => r.nomination_id);
}

