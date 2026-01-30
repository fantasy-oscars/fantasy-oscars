import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";
import type { ApiResult } from "../lib/types";

export type AdminUserRow = {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
};

export function useAdminUsersSearchOrchestration() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [results, setResults] = useState<AdminUserRow[]>([]);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setStatus(null);
      return;
    }
    setSearching(true);
    setStatus(null);
    const res = await fetchJson<{ users: AdminUserRow[] }>(
      `/admin/users?q=${encodeURIComponent(q)}`,
      { method: "GET" }
    );
    setSearching(false);
    if (!res.ok) {
      setResults([]);
      setStatus({ ok: false, message: res.error ?? "Search failed" });
      return;
    }
    setResults(res.data?.users ?? []);
    setStatus({ ok: true, message: `Found ${(res.data?.users ?? []).length} user(s)` });
  }, [query]);

  return { query, setQuery, searching, status, results, search };
}

export type AdminUserDetail = {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
};

export function useAdminUserDetailOrchestration(args: { userId: number | null }) {
  const { userId } = args;
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [user, setUser] = useState<AdminUserDetail | null>(null);

  const load = useCallback(async () => {
    if (userId === null) return;
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<{ user: AdminUserDetail }>(`/admin/users/${userId}`, {
      method: "GET"
    });
    setLoading(false);
    if (!res.ok) {
      setUser(null);
      setStatus({ ok: false, message: res.error ?? "Failed to load user" });
      return;
    }
    setUser(res.data?.user ?? null);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setAdmin = useCallback(
    async (nextIsAdmin: boolean) => {
      if (!user) return;
      setStatus(null);
      const res = await fetchJson<{ user: AdminUserDetail }>(`/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: nextIsAdmin })
      });
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to update role" });
        return;
      }
      setUser(res.data?.user ?? null);
      setStatus({ ok: true, message: nextIsAdmin ? "Promoted to admin" : "Demoted" });
    },
    [user]
  );

  return { loading, status, user, load, setAdmin };
}
