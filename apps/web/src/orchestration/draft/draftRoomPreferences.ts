import {
  DEFAULT_DRAFT_ROOM_PREFERENCES,
  draftRoomPreferencesKey,
  parseDraftRoomPreferences,
  serializeDraftRoomPreferences,
  type DraftRoomPreferences
} from "../../decisions/draft/preferences";

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): PreferenceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Accessing localStorage itself can throw (blocked site data, sandboxed frames).
    return null;
  }
}

/** Read stored preferences; any storage failure yields the defaults. */
export function loadDraftRoomPreferences(
  userKey: string | number | null | undefined,
  storage: PreferenceStorage | null = defaultStorage()
): DraftRoomPreferences {
  if (!storage) return DEFAULT_DRAFT_ROOM_PREFERENCES;
  try {
    return parseDraftRoomPreferences(storage.getItem(draftRoomPreferencesKey(userKey)));
  } catch {
    return DEFAULT_DRAFT_ROOM_PREFERENCES;
  }
}

/** Best-effort write; quota or privacy-mode failures are ignored. */
export function saveDraftRoomPreferences(
  userKey: string | number | null | undefined,
  prefs: DraftRoomPreferences,
  storage: PreferenceStorage | null = defaultStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(
      draftRoomPreferencesKey(userKey),
      serializeDraftRoomPreferences(prefs)
    );
  } catch {
    // Preferences are a convenience; losing them must never break the draft room.
  }
}
