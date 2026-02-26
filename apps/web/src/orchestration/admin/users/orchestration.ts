import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { notify } from "../../../notifications";

export type AdminUserRow = {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  admin_role: "NONE" | "OPERATOR" | "SUPER_ADMIN";
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

  const setAdminRoleForUser = useCallback(
    async (userId: number, adminRole: "NONE" | "OPERATOR" | "SUPER_ADMIN") => {
      if (!Number.isFinite(userId) || userId <= 0) return;
      setUpdatingById((m) => ({ ...m, [userId]: true }));
      setStatus(null);
      const res = await fetchJson<{
        user: {
          id: number;
          username: string;
          email: string;
          is_admin: boolean;
          admin_role: "NONE" | "OPERATOR" | "SUPER_ADMIN";
        };
      }>(`/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_role: adminRole })
      });
      setUpdatingById((m) => ({ ...m, [userId]: false }));
      if (!res.ok) {
        setStatus({ ok: false, message: res.error ?? "Failed to update role" });
        return;
      }
      const u = res.data?.user;
      if (u) {
        setResults((prev) =>
          prev.map((row) => (row.id === userId ? { ...row, ...u } : row))
        );
      }
      notify({
        id: "admin.users.role.updated",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message:
          adminRole === "SUPER_ADMIN"
            ? "User promoted to super admin"
            : adminRole === "OPERATOR"
              ? "User set to operator"
              : "User role reset to user"
      });
    },
    []
  );

  const deleteUser = useCallback(async (userId: number) => {
    if (!Number.isFinite(userId) || userId <= 0) {
      return { ok: false as const, error: "Invalid user id" };
    }
    setUpdatingById((m) => ({ ...m, [userId]: true }));
    setStatus(null);
    const res = await fetchJson(`/admin/users/${userId}`, {
      method: "DELETE"
    });
    setUpdatingById((m) => ({ ...m, [userId]: false }));
    if (!res.ok) {
      setStatus({ ok: false, message: res.error ?? "Failed to remove user" });
      return { ok: false as const, error: res.error ?? "Failed to remove user" };
    }
    setResults((prev) => prev.filter((row) => row.id !== userId));
    notify({
      id: "admin.users.delete.success",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "User removed"
    });
    return { ok: true as const };
  }, []);

  const loadDeletePreview = useCallback(async (userId: number) => {
    if (!Number.isFinite(userId) || userId <= 0) {
      return { ok: false as const, error: "Invalid user id" };
    }
    const res = await fetchJson<{
      user: { id: number; username: string };
      consequences: {
        leagues_removed: number;
        leagues_commissioner_transferred: number;
        open_season_memberships_removed: number;
        open_season_commissioner_transferred: number;
      };
    }>(`/admin/users/${userId}/delete-preview`, { method: "GET" });
    if (!res.ok || !res.data?.user || !res.data?.consequences) {
      return { ok: false as const, error: res.error ?? "Failed to load preview" };
    }
    return { ok: true as const, preview: res.data };
  }, []);

  return {
    query,
    setQuery,
    searching,
    status,
    results,
    search,
    setAdminRoleForUser,
    deleteUser,
    loadDeletePreview,
    updatingById
  };
}
