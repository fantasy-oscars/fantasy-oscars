import { Link } from "react-router-dom";
import { useCallback, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { ApiResult } from "../../../lib/types";
import { FormStatus } from "../../../ui/forms";

export function AdminUsersSearchPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<ApiResult | null>(null);
  const [results, setResults] = useState<
    Array<{ id: number; username: string; email: string; is_admin: boolean }>
  >([]);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setStatus(null);
      return;
    }
    setSearching(true);
    setStatus(null);
    const res = await fetchJson<{
      users: Array<{ id: number; username: string; email: string; is_admin: boolean }>;
    }>(`/admin/users?q=${encodeURIComponent(q)}`, { method: "GET" });
    setSearching(false);
    if (!res.ok) {
      setResults([]);
      setStatus({ ok: false, message: res.error ?? "Search failed" });
      return;
    }
    setResults(res.data?.users ?? []);
    setStatus({ ok: true, message: `Found ${(res.data?.users ?? []).length} user(s)` });
  }, [query]);

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
        <button
          className="button"
          type="button"
          disabled={searching}
          onClick={() => void search()}
        >
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
