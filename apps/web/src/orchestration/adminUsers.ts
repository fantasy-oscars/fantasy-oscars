import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../lib/api";
import type { ApiResult } from "../lib/types";
import { notify } from "../notifications";

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
  const [updatingById, setUpdatingById] = useState<Record<number, boolean>>({});
  const debounceRef = useRef<number | null>(null);

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
    setStatus(null);
  }, [query]);

  // Light debounce so the search box can be used as a combobox without hammering the API.
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void search();
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    };
  }, [query, search]);

  const setAdminForUser = useCallback(
    async (userId: number, nextIsAdmin: boolean) => {
      if (!Number.isFinite(userId) || userId <= 0) return;
      setUpdatingById((m) => ({ ...m, [userId]: true }));
      setStatus(null);
      const res = await fetchJson<{
        user: { id: number; username: string; email: string; is_admin: boolean };
      }>(`/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: nextIsAdmin })
      });
      setUpdatingById((m) => ({ ...m, [userId]: false }));
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to update role" });
        return;
      }
      const u = res.data?.user;
      if (u) {
        setResults((prev) => prev.map((row) => (row.id === userId ? { ...row, ...u } : row)));
      }
      notify({
        id: "admin.users.role.updated",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: nextIsAdmin ? "User promoted to admin" : "User demoted"
      });
    },
    []
  );

  return { query, setQuery, searching, status, results, search, setAdminForUser, updatingById };
}
