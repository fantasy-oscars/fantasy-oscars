import { createContext, useCallback, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMantineColorScheme } from "@ui";
import { useAuthContext } from "../auth/context";
import { setSavedPreferences } from "../orchestration/brand/accountCache";
import {
  useBrandOrchestration,
  type BrandOrchestration,
  type SavedPreferences
} from "../orchestration/brand/orchestration";

const BrandContext = createContext<BrandOrchestration | null>(null);

export function useBrandContext() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("BrandContext missing");
  return ctx;
}

/** Must sit inside AuthProvider: the account's saved appearance comes from the session. */
export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, sessionError } = useAuthContext();
  const { setColorScheme } = useMantineColorScheme();
  const queryClient = useQueryClient();
  const onAccountSaved = useCallback(
    (saved: SavedPreferences) => setSavedPreferences(queryClient, saved),
    [queryClient]
  );
  const value = useBrandOrchestration({
    user,
    authLoading: loading,
    sessionError,
    setColorScheme,
    onAccountSaved
  });
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}
