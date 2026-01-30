import { Link } from "react-router-dom";
import { FormStatus } from "../../../ui/forms";
import type { ApiResult } from "../../../lib/types";
import type { AdminUserRow } from "../../../orchestration/adminUsers";

export function AdminUsersSearchScreen(props: {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  status: ApiResult | null;
  results: AdminUserRow[];
  onSearch: () => void;
}) {
  const { query, setQuery, searching, status, results, onSearch } = props;

  return (
    <section className="stack">
      <div className="inline-form">
        <label className="field" style={{ flex: 1, minWidth: 240 }}>
          <span>Username or email</span>
          <input
            className="inline-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Start typing..."
          />
        </label>
        <button className="button" type="button" disabled={searching} onClick={onSearch}>
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      <FormStatus loading={searching} result={status} />

      {results.length === 0 ? (
        <div className="empty-state">
          <strong>No results.</strong>
          <div className="muted" style={{ marginTop: 6 }}>
            Enter a username or email and run a search.
          </div>
        </div>
      ) : (
        <ul className="list" aria-label="User results">
          {results.map((u) => (
            <li key={u.id} className="list-row">
              <div>
                <strong>{u.username}</strong>
                <div className="muted">{u.email}</div>
              </div>
              <div className="inline-actions">
                {u.is_admin ? <span className="pill warning">Admin</span> : null}
                <Link className="button ghost" to={`/admin/users/${u.id}`}>
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
