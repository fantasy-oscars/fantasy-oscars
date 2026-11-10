import {
  ENABLED_BRAND_IDS,
  hasRandomSelection,
  type BrandId
} from "@fantasy-oscars/shared";
import type { UpdatePreferencesBody } from "@fantasy-oscars/shared/schemas";
import { validationError } from "../../errors.js";
import { query, type DbClient } from "../db.js";

/** Column list for the stored appearance, for use in an `app_user` select. */
export const APPEARANCE_COLUMNS = `mode_preference, random_excluded_brands, undiscovered_enabled,
  single_mode_policy, discovered_brands, daily_draw`;

/** The stored appearance columns of one `app_user` row. */
export type AppearanceRow = {
  mode_preference: string | null;
  random_excluded_brands: string[];
  undiscovered_enabled: boolean;
  single_mode_policy: string;
  discovered_brands: string[];
  daily_draw: unknown;
};

/** The `appearance` object of /auth/me, login and the preferences PATCH. Values are returned as stored. */
export function toStoredAppearance(row: AppearanceRow): AppearanceRow {
  return {
    mode_preference: row.mode_preference ?? null,
    random_excluded_brands: row.random_excluded_brands ?? [],
    undiscovered_enabled: row.undiscovered_enabled ?? true,
    single_mode_policy: row.single_mode_policy ?? "own",
    discovered_brands: row.discovered_brands ?? [],
    daily_draw: row.daily_draw ?? null
  };
}

type PreferencesRow = AppearanceRow & { brand_preference: string | null };

/**
 * Partial update of a user's preferences in one UPDATE. Returns null when the
 * user does not exist. The saved day is compare-and-set: it applies only when
 * there is no record, the stored day is older, or the stored theme is no
 * longer released; otherwise the stored record comes back unchanged.
 */
export async function updateUserPreferences(
  db: DbClient,
  userId: number,
  body: UpdatePreferencesBody
): Promise<{ brand_preference: string | null; appearance: AppearanceRow } | null> {
  if (body.random_excluded_brands || body.undiscovered_enabled === false) {
    await assertSelectionRemains(db, userId, body);
  }

  const sets: string[] = [];
  const params: unknown[] = [userId];
  const bind = (column: string, value: unknown, cast = "") => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };

  if (body.brand_preference !== undefined)
    bind("brand_preference", body.brand_preference);
  if (body.mode_preference !== undefined) bind("mode_preference", body.mode_preference);
  if (body.random_excluded_brands !== undefined) {
    bind("random_excluded_brands", body.random_excluded_brands, "::text[]");
  }
  if (body.undiscovered_enabled !== undefined) {
    bind("undiscovered_enabled", body.undiscovered_enabled);
  }
  if (body.single_mode_policy !== undefined) {
    bind("single_mode_policy", body.single_mode_policy);
  }
  if (body.add_discovered_brands !== undefined) {
    params.push(body.add_discovered_brands);
    sets.push(
      `discovered_brands = ARRAY(SELECT DISTINCT unnest(discovered_brands || $${params.length}::text[]) ORDER BY 1)`
    );
  }
  if (body.daily_draw !== undefined) {
    params.push(JSON.stringify(body.daily_draw), body.daily_draw.day, [
      ...ENABLED_BRAND_IDS
    ]);
    const draw = `$${params.length - 2}::jsonb`;
    const day = `$${params.length - 1}::integer`;
    const enabled = `$${params.length}::text[]`;
    sets.push(
      `daily_draw = CASE
         WHEN daily_draw IS NULL
           OR (daily_draw->>'day') IS NULL
           OR (daily_draw->>'day')::integer < ${day}
           OR NOT ((daily_draw->>'brand') = ANY(${enabled}))
         THEN ${draw}
         ELSE daily_draw
       END`
    );
  }

  const { rows } = await query<PreferencesRow>(
    db,
    `UPDATE app_user
     SET ${sets.join(", ")}
     WHERE id = $1
       AND deleted_at IS NULL
     RETURNING brand_preference, ${APPEARANCE_COLUMNS}`,
    params
  );
  const row = rows[0];
  if (!row) return null;
  return { brand_preference: row.brand_preference, appearance: toStoredAppearance(row) };
}

/**
 * The Random list must leave something selected, counted after any discoveries
 * in the same request and with Undiscovered themes and exclusions as sent or stored.
 */
async function assertSelectionRemains(
  db: DbClient,
  userId: number,
  body: UpdatePreferencesBody
): Promise<void> {
  const { rows } = await query<{
    discovered_brands: string[];
    random_excluded_brands: string[];
    undiscovered_enabled: boolean;
  }>(
    db,
    `SELECT discovered_brands, random_excluded_brands, undiscovered_enabled
     FROM app_user
     WHERE id = $1
       AND deleted_at IS NULL`,
    [userId]
  );
  const stored = rows[0];
  if (!stored) return;
  const discovered = [
    ...new Set([...stored.discovered_brands, ...(body.add_discovered_brands ?? [])])
  ] as BrandId[];
  const ok = hasRandomSelection({
    discovered,
    excluded: (body.random_excluded_brands ?? stored.random_excluded_brands) as BrandId[],
    undiscoveredEnabled: body.undiscovered_enabled ?? stored.undiscovered_enabled
  });
  if (!ok) {
    throw validationError("Keep at least one theme in the Random list", [
      body.random_excluded_brands ? "random_excluded_brands" : "undiscovered_enabled"
    ]);
  }
}
