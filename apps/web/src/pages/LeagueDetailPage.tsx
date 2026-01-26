import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuthContext } from "../auth/context";
import { FormStatus } from "../ui/forms";
import { PageError, PageLoader } from "../ui/page-state";
import { allocationLabel } from "../lib/labels";
import { buildLeagueInviteText, seasonLabel } from "../features/leagues/labels";
import { useLeagueDetail } from "../features/leagues/useLeagueDetail";

export function LeagueDetailPage() {
  const { id } = useParams();
  const leagueId = Number(id);
  const { user } = useAuthContext();
  const detail = useLeagueDetail({ leagueId, userSub: user?.sub });
  const [transferTarget, setTransferTarget] = useState("");

  async function copyInvite() {
    if (!detail.league) return;
    const text = buildLeagueInviteText({
      origin: window.location.origin,
      league: { id: detail.league.id, code: detail.league.code }
    });
    await navigator.clipboard?.writeText(text);
    detail.setRosterStatus({ ok: true, message: "Invite copied" });
  }

  async function onTransferOwnership() {
    if (!transferTarget) return;
    const targetId = Number(transferTarget);
    if (!Number.isFinite(targetId)) return;
    if (!window.confirm("Transfer commissioner role to this member?")) return;
    const res = await detail.transferOwnership(targetId);
    if (res.ok) setTransferTarget("");
  }

  async function onRemoveMember(userId: number, role: string) {
    if (role === "OWNER") return;
    if (!window.confirm("Remove this member from the league?")) return;
    await detail.removeMember(userId);
  }

  if (detail.state === "loading") {
    return <PageLoader label="Loading league..." />;
  }
  if (detail.state === "forbidden") {
    return (
      <section className="card">
        <header>
          <h2>League</h2>
          <p className="muted">Access denied.</p>
        </header>
        <PageError message="You are not a member of this league." />
      </section>
    );
  }
  if (detail.state === "error") {
    return (
      <section className="card">
        <header>
          <h2>League</h2>
          <p className="muted">Unable to load</p>
        </header>
        <PageError message={detail.error ?? "Unexpected error"} />
      </section>
    );
  }

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>{detail.league?.name ?? `League #${leagueId}`}</h2>
          <p>Roster, seasons, and commissioner actions.</p>
        </div>
      </header>

      <div className="card nested">
        <header>
          <h3>Roster</h3>
          <p className="muted">Members and roles</p>
        </header>
        {detail.roster === null ? (
          <p className="muted">Roster hidden (commissioner-only).</p>
        ) : detail.roster.length === 0 ? (
          <p className="muted">No members yet.</p>
        ) : (
          <ul className="list">
            {detail.roster.map((m) => (
              <li key={m.id} className="list-row">
                <span>{m.username}</span>
                <span className="pill">{m.role}</span>
                {detail.isCommissioner && m.role !== "OWNER" && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void onRemoveMember(m.user_id, m.role)}
                    disabled={detail.working}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {detail.isCommissioner && (
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => void copyInvite()}>
              Copy invite
            </button>
            <FormStatus loading={detail.working} result={detail.rosterStatus} />
          </div>
        )}
      </div>

      {detail.isCommissioner && (
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
              disabled={!detail.isOwner || detail.working}
            >
              <option value="">Transfer to...</option>
              {detail.roster
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
              disabled={!detail.isOwner || detail.working || !transferTarget}
            >
              Transfer commissioner
            </button>
          </div>
          <FormStatus loading={detail.working} result={detail.rosterStatus} />
        </div>
      )}

      <div className="card nested" style={{ marginTop: 16 }}>
        <header className="header-with-controls">
          <div>
            <h3>Seasons</h3>
            <p className="muted">Active and past seasons for this league.</p>
          </div>
          {detail.isCommissioner && (
            <div className="inline-actions">
              <Link to={`/leagues/${leagueId}/seasons/new`} className="button">
                Create season
              </Link>
            </div>
          )}
        </header>
        {detail.seasons.length === 0 ? (
          <p className="muted">
            No seasons yet. Once an active ceremony is configured, you can create the
            first season.
          </p>
        ) : (
          <div className="grid">
            {detail.seasons.map((s) => (
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
