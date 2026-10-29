import type { PoolMode } from "../draft";

/**
 * Purely presentational draft-room preferences. Nothing here may influence game
 * state; anything that does (picks, autodraft settings) belongs on the server.
 */
export type DraftRoomPreferences = {
  poolMode: PoolMode;
  soundEnabled: boolean;
  cursorSpyEnabled: boolean;
  /** Rail open state; null means "no stored choice, use the default for the phase". */
  rails: { ledger: boolean | null; roster: boolean | null; autodraft: boolean | null };
};

export const DEFAULT_DRAFT_ROOM_PREFERENCES: DraftRoomPreferences = {
  poolMode: "ALL_MUTED",
  soundEnabled: true,
  cursorSpyEnabled: true,
  rails: { ledger: null, roster: null, autodraft: null }
};

export function draftRoomPreferencesKey(userKey: string | number | null | undefined) {
  return `fo.draftRoom.prefs.v1.${userKey ?? "anon"}`;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** Tolerant parse: unknown or malformed input falls back to defaults field by field. */
export function parseDraftRoomPreferences(raw: string | null): DraftRoomPreferences {
  const defaults = DEFAULT_DRAFT_ROOM_PREFERENCES;
  if (!raw) return defaults;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (!value || typeof value !== "object") return defaults;
  const v = value as Record<string, unknown>;
  const rails = (v.rails && typeof v.rails === "object" ? v.rails : {}) as Record<
    string,
    unknown
  >;
  return {
    poolMode: v.poolMode === "UNDRAFTED_ONLY" ? "UNDRAFTED_ONLY" : "ALL_MUTED",
    soundEnabled: boolOrNull(v.soundEnabled) ?? defaults.soundEnabled,
    cursorSpyEnabled: boolOrNull(v.cursorSpyEnabled) ?? defaults.cursorSpyEnabled,
    rails: {
      ledger: boolOrNull(rails.ledger),
      roster: boolOrNull(rails.roster),
      autodraft: boolOrNull(rails.autodraft)
    }
  };
}

export function serializeDraftRoomPreferences(prefs: DraftRoomPreferences): string {
  return JSON.stringify(prefs);
}
