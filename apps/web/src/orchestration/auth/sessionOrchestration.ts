import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "../../lib/api";
import { clearAuthToken, setAuthToken } from "../../lib/authToken";

export type AuthUser = {
  sub: string;
  username?: string;
  email?: string;
  is_admin?: boolean;
  admin_role?: "NONE" | "OPERATOR" | "SUPER_ADMIN";
  avatar_key?: string;
};

export type AuthSessionOrchestration = {
  user: AuthUser | null;
  loading: boolean;
  sessionError: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  login: (input: { username: string; password: string }) => Promise<
    | { ok: true }
    | {
        ok: false;
        error?: string;
        errorCode?: string;
        errorFields?: string[];
        requestId?: string;
      }
  >;
  register: (input: { username: string; email: string; password: string }) => Promise<
    | { ok: true }
    | {
        ok: false;
        error?: string;
        errorCode?: string;
        errorFields?: string[];
        requestId?: string;
      }
  >;
};

export function useAuthSessionOrchestration(): AuthSessionOrchestration {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setSessionError(null);
    const res = await fetchJson<{ user: AuthUser }>("/auth/me", { method: "GET" });
    if (res.ok) {
      setUser(res.data?.user ?? null);
    } else {
      setUser(null);
      // Missing/expired/invalid token is a normal "signed out" state.
      if (
        res.errorCode === "UNAUTHORIZED" ||
        res.errorCode === "INVALID_TOKEN" ||
        res.errorCode === "TOKEN_EXPIRED"
      ) {
        setSessionError(null);
      } else {
        setSessionError(res.error ?? "Unable to verify session");
      }
    }
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    await fetchJson("/auth/logout", { method: "POST" });
    clearAuthToken();
    setUser(null);
    setLoading(false);
  }, []);

  const login = useCallback(async (input: { username: string; password: string }) => {
    const res = await fetchJson<{ user: AuthUser; token?: string }>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    if (res.ok && res.data?.user) {
      setAuthToken(res.data.token);
      setUser(res.data.user);
      return { ok: true as const };
    }
    setUser(null);
    clearAuthToken();
    return {
      ok: false as const,
      error: res.error,
      errorCode: res.errorCode,
      errorFields: res.errorFields,
      requestId: res.requestId
    };
  }, []);

  const register = useCallback(
    async (input: { username: string; email: string; password: string }) => {
      const res = await fetchJson<{ user: AuthUser }>("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      if (res.ok) {
        // Auto-login fetch (ensures `user` state is populated).
        await login({ username: input.username, password: input.password });
        return { ok: true as const };
      }
      return {
        ok: false as const,
        error: res.error,
        errorCode: res.errorCode,
        errorFields: res.errorFields,
        requestId: res.requestId
      };
    },
    [login]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({ user, loading, sessionError, refresh, logout, login, register }),
    [user, loading, sessionError, refresh, logout, login, register]
  );
}
