import { createContext, useContext } from "react";
import { useAuthContext } from "../auth/context";
import {
  useBrandOrchestration,
  type BrandOrchestration
} from "../orchestration/brand/orchestration";

const BrandContext = createContext<BrandOrchestration | null>(null);

export function useBrandContext() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("BrandContext missing");
  return ctx;
}

/** Must sit inside AuthProvider: the account's saved preference comes from the session. */
export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, refresh } = useAuthContext();
  const value = useBrandOrchestration({
    user,
    authLoading: loading,
    refreshAuth: refresh
  });
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}
