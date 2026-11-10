import type { QueryClient } from "@tanstack/react-query";
import type { AuthUser } from "../auth/sessionOrchestration";
import { queryKeys } from "../query/keys";
import type { SavedPreferences } from "./orchestration";

/** Puts saved appearance values into the session query, so every reader sees them. */
export function setSavedPreferences(queryClient: QueryClient, saved: SavedPreferences) {
  queryClient.setQueryData<AuthUser | null>(queryKeys.auth.me(), (current) =>
    current
      ? {
          ...current,
          brand_preference: saved.brand_preference,
          appearance: saved.appearance
        }
      : current
  );
}
