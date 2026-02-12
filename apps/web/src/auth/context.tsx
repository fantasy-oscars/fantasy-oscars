import { createContext, useContext } from "react";
import {
  useAuthSessionOrchestration,
  type AuthSessionOrchestration
} from "../orchestration/auth/sessionOrchestration";

export type { AuthUser } from "../orchestration/auth/sessionOrchestration";

export type AuthContextValue = AuthSessionOrchestration;

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext missing");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useAuthSessionOrchestration();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
