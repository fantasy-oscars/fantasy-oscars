import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "../../lib/api";
import { clearAuthToken, setAuthToken } from "../../lib/authToken";
import { ApiQueryError, errorMessage } from "../query/errors";
import { queryKeys } from "../query/keys";

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
  sessionRequestId?: string;
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

const SIGNED_OUT_CODES = new Set(["UNAUTHORIZED", "INVALID_TOKEN", "TOKEN_EXPIRED"]);

async function loadSession(): Promise<AuthUser | null> {
  const res = await fetchJson<{ user: AuthUser; token?: string }>("/auth/me", {
    method: "GET"
  });
  if (res.ok) {
    // Keep the Bearer fallback token in step with the sliding session expiry.
    if (res.data?.token) setAuthToken(res.data.token);
    return res.data?.user ?? null;
  }
  // Missing/expired/invalid token is a normal "signed out" state.
  if (res.errorCode && SIGNED_OUT_CODES.has(res.errorCode)) {
    // Drop a stored token the server no longer accepts (revoked/expired).
    clearAuthToken();
    return null;
  }
  throw new ApiQueryError(res.error ?? "Unable to verify session", {
    status: res.status,
    errorCode: res.errorCode,
    requestId: res.requestId
  });
}

export function useAuthSessionOrchestration(): AuthSessionOrchestration {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: loadSession
  });

  const user = session.data ?? null;
  // Only the first check blocks the UI; focus refetches happen in the background.
  const loading = session.isPending;
  const sessionError = session.isError
    ? errorMessage(session.error, "Unable to verify session")
    : null;
  const sessionRequestId =
    session.error instanceof ApiQueryError ? session.error.requestId : undefined;

  // A different user must never see the previous user's cached data. In-flight
  // requests are cancelled first so their results cannot land after the reset.
  const resetUserData = useCallback(
    (nextUser: AuthUser | null) => {
      const isUserScoped = (q: { queryKey: readonly unknown[] }) =>
        q.queryKey[0] !== queryKeys.auth.all[0];
      void queryClient.cancelQueries({ predicate: isUserScoped });
      queryClient.removeQueries({ predicate: isUserScoped });
      queryClient.setQueryData(queryKeys.auth.me(), nextUser);
    },
    [queryClient]
  );

  // Another tab logged in as someone else: a focus refetch of /auth/me returns a
  // different user. Treat it like a login and drop the previous user's cache.
  const lastSubRef = useRef<string | null>(null);
  const currentSub = session.data?.sub ?? null;
  useEffect(() => {
    const prev = lastSubRef.current;
    lastSubRef.current = currentSub;
    if (prev && currentSub && prev !== currentSub) {
      const isUserScoped = (q: { queryKey: readonly unknown[] }) =>
        q.queryKey[0] !== queryKeys.auth.all[0];
      // Mounted screens stay subscribed, so reset (and refetch) rather than remove.
      void queryClient.cancelQueries({ predicate: isUserScoped });
      void queryClient.resetQueries({ predicate: isUserScoped });
    }
  }, [currentSub, queryClient]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
  }, [queryClient]);

  const logout = useCallback(async () => {
    await fetchJson("/auth/logout", { method: "POST" });
    clearAuthToken();
    resetUserData(null);
  }, [resetUserData]);

  const login = useCallback(
    async (input: { username: string; password: string }) => {
      const res = await fetchJson<{ user: AuthUser; token?: string }>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      if (res.ok && res.data?.user) {
        setAuthToken(res.data.token);
        resetUserData(res.data.user);
        return { ok: true as const };
      }
      clearAuthToken();
      resetUserData(null);
      return {
        ok: false as const,
        error: res.error,
        errorCode: res.errorCode,
        errorFields: res.errorFields,
        requestId: res.requestId
      };
    },
    [resetUserData]
  );

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

  return useMemo(
    () => ({
      user,
      loading,
      sessionError,
      sessionRequestId,
      refresh,
      logout,
      login,
      register
    }),
    [user, loading, sessionError, sessionRequestId, refresh, logout, login, register]
  );
}
