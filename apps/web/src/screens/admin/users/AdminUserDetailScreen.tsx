import { Link } from "react-router-dom";
import { FormStatus } from "../../../ui/forms";
import type { ApiResult } from "../../../lib/types";

export function AdminUserDetailScreen(props: {
  user: { id: number; username: string; email: string; is_admin: boolean };
  status: ApiResult | null;
  onPromote: () => void;
  onDemote: () => void;
}) {
  const { user, status, onPromote, onDemote } = props;

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
            <button type="button" className="danger" onClick={onDemote}>
              Demote from admin
            </button>
          ) : (
            <button type="button" onClick={onPromote}>
              Promote to admin
            </button>
          )}
        </div>
        <FormStatus loading={false} result={status} />
      </div>
    </section>
  );
}
