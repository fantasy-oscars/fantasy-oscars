import { Link } from "react-router-dom";
import type { AuthUser } from "../../auth/context";
import { FormStatus } from "../../ui/forms";
import { PageError, PageLoader } from "../../ui/page-state";
import { allocationLabel } from "../../lib/labels";
import type { LeagueDetailView } from "../../orchestration/leagues";

function seasonLabel(season: {
  id: number;
  ceremony_starts_at?: string | null;
  created_at?: string | null;
}) {
  const date = season.ceremony_starts_at ?? season.created_at;
  try {
    const year = new Date(date ?? "").getFullYear();
    if (Number.isFinite(year)) return `Season ${year}`;
  } catch {
    // Fall back to id below.
  }
  return `Season ${season.id}`;
}

export function LeagueDetailScreen(props: {
  user: AuthUser | null;
  leagueId: number;
  view: LeagueDetailView;
  working: boolean;
  rosterStatus: { ok: boolean; message: string } | null;
  transferTarget: string;
  setTransferTarget: (v: string) => void;
  onCopyInvite: () => void | Promise<unknown>;
  onTransferOwnership: () => void | Promise<unknown>;
  onRemoveMember: (userId: number, role: string) => void | Promise<unknown>;
}) {
  const {
    user,
    leagueId,
    view,
    working,
    rosterStatus,
    transferTarget,
    setTransferTarget,
    onCopyInvite,
    onTransferOwnership,
    onRemoveMember
  } = props;

  if (view.state === "loading") {
    return <PageLoader label="Loading league..." />;
  }
  if (view.state === "forbidden") {
    return (
      <section className="card">
        <header>
          <h2>League</h2>
          <p className="muted">Access denied.</p>
        </header>
        <PageError message={view.message} />
      </section>
    );
  }
  if (view.state === "error") {
    return (
      <section className="card">
        <header>
          <h2>League</h2>
          <p className="muted">Unable to load</p>
        </header>
        <PageError message={view.message} />
      </section>
    );
  }

  const league = view.league;

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>{league.name ?? `League #${leagueId}`}</h2>
          <p>Roster, seasons, and commissioner actions.</p>
        </div>
      </header>

      <div className="card nested">
        <header>
          <h3>Roster</h3>
          <p className="muted">Members and roles</p>
        </header>
        {view.roster === null ? (
          <p className="muted">Roster hidden (commissioner-only).</p>
        ) : view.roster.length === 0 ? (
          <p className="muted">No members yet.</p>
        ) : (
          <ul className="list">
            {view.roster.map((m) => (
              <li key={m.id} className="list-row">
                <span>{m.username}</span>
                <span className="pill">{m.role}</span>
                {view.isCommissioner && m.role !== "OWNER" && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void onRemoveMember(m.user_id, m.role)}
                    disabled={working}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {view.isCommissioner && (
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => void onCopyInvite()}>
              Copy invite
            </button>
            <FormStatus loading={working} result={rosterStatus} />
          </div>
        )}
      </div>

      {view.isCommissioner && (
        <div className="card nested" style={{ marginTop: 16 }}>
          <header>
            <h3>Commissioner Controls</h3>
            <p className="muted">
              Transfer commissioner role or remove members. Owner only for transfer.
            </p>
          </header>
          <div className="inline-actions">
            <select
              aria-label="Transfer to member"
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              disabled={!view.isOwner || working}
            >
              <option value="">Transfer to...</option>
              {view.roster
                ?.filter((m) => m.user_id !== Number(user?.sub))
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.username} ({m.role})
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => void onTransferOwnership()}
              disabled={!view.isOwner || working || !transferTarget}
            >
              Transfer commissioner
            </button>
          </div>
          <FormStatus loading={working} result={rosterStatus} />
        </div>
      )}

      <div className="card nested" style={{ marginTop: 16 }}>
        <header className="header-with-controls">
          <div>
            <h3>Seasons</h3>
            <p className="muted">Active and past seasons for this league.</p>
          </div>
          {view.isCommissioner && (
            <div className="inline-actions">
              <Link to={`/leagues/${leagueId}/seasons/new`} className="button">
                Create season
              </Link>
            </div>
          )}
        </header>
        {view.seasons.length === 0 ? (
          <p className="muted">
            No seasons yet. Once an active ceremony is configured, you can create the
            first season.
          </p>
        ) : (
          <div className="grid">
            {view.seasons.map((s) => (
              <div key={s.id} className="card">
                <header>
                  <h4>{seasonLabel(s)}</h4>
                  <p className="muted">
                    {s.is_active_ceremony === false
                      ? "Archived season"
                      : "Current season"}
                  </p>
                </header>
                <div className="pill-list">
                  <span className="pill">
                    {s.is_active_ceremony === false ? "ARCHIVED" : "ACTIVE"}
                  </span>
                  <span className="pill">Status: {s.status}</span>
                  <span className="pill">Ceremony {s.ceremony_id}</span>
                  {s.remainder_strategy && (
                    <span className="pill">{allocationLabel(s.remainder_strategy)}</span>
                  )}
                  {s.draft_status && (
                    <span className="pill">Draft: {s.draft_status}</span>
                  )}
                </div>
                <div className="inline-actions">
                  <Link to={`/seasons/${s.id}`}>Open season</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
