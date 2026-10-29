import { useCallback, useRef, useState } from "react";
import type { DraftRoomPreferences } from "../../decisions/draft/preferences";
import {
  loadDraftRoomPreferences,
  saveDraftRoomPreferences
} from "./draftRoomPreferences";

export type DraftRoomPreferencesPatch = Partial<Omit<DraftRoomPreferences, "rails">> & {
  rails?: Partial<DraftRoomPreferences["rails"]>;
};

/** Per-user presentational preferences, persisted to localStorage on every change. */
export function useDraftRoomPreferences(userKey: string | number | null | undefined) {
  const [preferences, setPreferences] = useState<DraftRoomPreferences>(() =>
    loadDraftRoomPreferences(userKey)
  );
  const latestRef = useRef(preferences);

  const updatePreferences = useCallback(
    (patch: DraftRoomPreferencesPatch) => {
      const next: DraftRoomPreferences = {
        ...latestRef.current,
        ...patch,
        rails: { ...latestRef.current.rails, ...patch.rails }
      };
      latestRef.current = next;
      setPreferences(next);
      saveDraftRoomPreferences(userKey, next);
    },
    [userKey]
  );

  return { preferences, updatePreferences };
}
