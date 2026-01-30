import { Link, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { FormStatus } from "../../../ui/forms";
import { PageError, PageLoader } from "../../../ui/page-state";

export function AdminUserDetailPage() {
  const { userId } = useParams();
  const idNum = userId ? Number(userId) : NaN;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [user, setUser] = useState<{
    id: number;
    username: string;
    email: string;
    is_admin: boolean;
    created_at: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(idNum)) return;
    setLoading(true);
    setStatus(null);
    const res = await fetchJson<{
      user: {
        id: number;
        username: string;
        email: string;
        is_admin: boolean;
        created_at: string;
      };
    }>(`/admin/users/${idNum}`, { method: "GET" });
    setLoading(false);
    if (!res.ok) {
      setUser(null);
      setStatus({ ok: false, message: res.error ?? "Failed to load user" });
      return;
    }
    setUser(res.data?.user ?? null);
  }, [idNum]);

  useEffect(() => {
    void load();
  }, [load]);

  const setAdmin = useCallback(
    async (nextIsAdmin: boolean) => {
      if (!user) return;
      const action = nextIsAdmin
        ? "Promote this user to admin?"
        : "Demote this admin user?";
      if (!window.confirm(action)) return;
      setStatus(null);
      const res = await fetchJson<{
        user: {
          id: number;
          username: string;
          email: string;
          is_admin: boolean;
          created_at: string;
        };
      }>(`/admin/users/${user.id}`, {
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

  if (!Number.isFinite(idNum)) return <PageError message="Invalid user id" />;
  if (loading && !user) return <PageLoader label="Loading user..." />;
  if (!user && status?.ok === false) return <PageError message={status.message} />;
  if (!user) return <PageError message="User not found" />;

  return (
    <section className="stack">
      <header className="header-with-controls">
        <div>
          <h3>{user.username}</h3>
          <p className="muted">{user.email}</p>
        </div>
        <div className="inline-actions">
          {user.is_admin ? (
            <span className="pill warning">Admin</span>
          ) : (
            <span className="pill muted">User</span>
          )}
          <Link className="button ghost" to="/admin/users">
            Back to search
          </Link>
        </div>
      </header>

      <div className="card nested">
        <h4>Role</h4>
        <p className="muted">
          Use this to grant or remove admin access. Admins can change global ceremony
          state and winners.
        </p>
        <div className="inline-actions">
          {user.is_admin ? (
            <button type="button" className="danger" onClick={() => void setAdmin(false)}>
              Demote from admin
            </button>
          ) : (
            <button type="button" onClick={() => void setAdmin(true)}>
              Promote to admin
            </button>
          )}
        </div>
        <FormStatus loading={false} result={status} />
      </div>
    </section>
  );
}
