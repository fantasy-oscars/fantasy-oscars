import type { QueryClient } from "@tanstack/react-query";
import { onSuccessfulWrite } from "../../lib/api";
import { queryKeys } from "./keys";

/**
 * Draft and ceremony state is embedded in season, league and ceremony reads, so
 * mark all of them stale. Active queries refetch; inactive ones refetch the next
 * time a screen mounts.
 */
export function invalidateCeremonyAndDraftData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.ceremonies.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.leagues.all })
  ]);
}

/**
 * Any successful write under `/admin/` (ceremonies, nominees, winners, status)
 * or `/drafts` (start, pause, resume, complete, picks) can change what the
 * cached season/league/ceremony reads show. Returns an unsubscribe function.
 */
export function registerWriteInvalidation(queryClient: QueryClient): () => void {
  return onSuccessfulWrite(({ path }) => {
    if (path.startsWith("/admin/") || path.startsWith("/drafts")) {
      void invalidateCeremonyAndDraftData(queryClient);
    }
  });
}
