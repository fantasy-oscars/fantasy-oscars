import { Link } from "react-router-dom";
import { allocationLabel } from "../../lib/labels";
import { FormStatus } from "../../ui/forms";
import { PageLoader } from "../../ui/page-state";

export function SeasonScreen(props: {
  seasonIdLabel: string;
  leagueIdForBackLink?: number | null;
  view: ReturnType<typeof import("../../orchestration/seasons").useSeasonOrchestration>;
  onDeleteSeason: () => void | Promise<void>;
}) {
  const { seasonIdLabel, leagueIdForBackLink, view: s, onDeleteSeason } = props;

  if (s.loading) return <PageLoader label="Loading season..." />;
  if (s.error) {
    return (
      <section className="card">
        <header>
          <h2>Season {seasonIdLabel}</h2>
          <p className="muted">Could not load season data.</p>
        </header>
        <div className="status status-error">{s.error}</div>
      </section>
    );
  }

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Season {seasonIdLabel}</h2>
          <p className="muted">
            {s.leagueContext?.league?.name
              ? `League ${s.leagueContext.league.name} • Ceremony ${
                  s.leagueContext.league.ceremony_id ?? "TBD"
                }`
              : "Season participants and invites"}
          </p>
        </div>
        {s.canEdit && (
          <div className="inline-actions">
            <button
              type="button"
              className="danger"
              disabled={s.working}
              onClick={onDeleteSeason}
            >
              Delete season
            </button>
          </div>
        )}
        <div className="pill-list">
          <span className="pill">Status: {s.seasonStatus}</span>
          <span className="pill">{s.isArchived ? "ARCHIVED (read-only)" : "ACTIVE"}</span>
          <span className="pill">Scoring: {s.scoringStrategy}</span>
          <span className="pill">
            Allocation: {allocationLabel(s.allocationStrategy)}
          </span>
        </div>
        {leagueIdForBackLink ? (
          <div className="inline-actions">
            <Link to={`/leagues/${leagueIdForBackLink}`} className="button ghost">
              Back to league
            </Link>
          </div>
        ) : null}
      </header>
      {s.canEdit && <FormStatus loading={s.working} result={s.cancelResult} />}

      {s.isArchived && (
        <div className="status status-info" role="status">
          Archived season: roster, invites, and scoring are locked. Draft room and
          standings remain view-only year-round.
        </div>
      )}

      <div className="card nested">
        <header className="header-with-controls">
          <div>
            <h3>Draft Room</h3>
            <p className="muted">Join the live draft for this season.</p>
          </div>
          <div className="inline-actions">
            {s.draftId ? (
              <Link to={`/drafts/${s.draftId}`}>Enter draft room</Link>
            ) : s.canEdit ? (
              <button
                type="button"
                onClick={() => void s.createDraft()}
                disabled={s.working}
              >
                Create draft
              </button>
            ) : (
              <span className="pill">Draft not created yet</span>
            )}
          </div>
        </header>
        {s.isArchived && (
          <p className="muted">
            Past season — draft actions are locked; results remain viewable.
          </p>
        )}
        {!s.draftId && s.canEdit && (
          <FormStatus loading={s.working} result={s.draftCreateResult} />
        )}
        {s.integrityWarningActive && (
          <div className="status status-warning" role="status">
            Heads up: once winners start getting entered after the ceremony begins,
            drafting stops immediately. If you are in the room then, it ends just like a
            cancellation.
          </div>
        )}
        {s.leagueContext?.season?.draft_status && (
          <p className="muted">
            Timer:{" "}
            {s.leagueContext.season.pick_timer_seconds
              ? `${s.leagueContext.season.pick_timer_seconds}s per pick (auto-pick: next available)`
              : "Off"}
          </p>
        )}
        {s.ceremonyStartsAt && (
          <p className="muted">
            Ceremony starts {s.formatDate(s.ceremonyStartsAt)} (warning window: 24h
            prior).
          </p>
        )}
        {!s.draftId && (
          <p className="muted">The commissioner will create the draft for this season.</p>
        )}
      </div>

      <div className="grid two-col">
        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Participants</h3>
              <p className="muted">Season roster.</p>
            </div>
          </header>
          {s.isArchived && (
            <div className="status status-info" role="status">
              Roster locked (archived season).
            </div>
          )}
          {s.members.length === 0 ? (
            <p className="muted">No participants yet.</p>
          ) : (
            <ul className="list">
              {s.members.map((m) => {
                const leagueProfile = s.leagueContext?.leagueMembers?.find(
                  (lm) => lm.user_id === m.user_id
                );
                return (
                  <li key={m.user_id} className="list-row">
                    <span>
                      {m.username ?? leagueProfile?.username ?? `User ${m.user_id}`}
                    </span>
                    <span className="pill">{m.role}</span>
                    {s.canEdit && m.role !== "OWNER" && (
                      <button
                        type="button"
                        className="ghost"
                        disabled={s.working}
                        onClick={() => void s.removeMember(m.user_id)}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {s.canEdit && (
            <>
              <div className="inline-actions">
                <select
                  value={s.selectedLeagueMember}
                  onChange={(e) => s.setSelectedLeagueMember(e.target.value)}
                  aria-label="Select league member"
                >
                  <option value="">Add league member...</option>
                  {s.availableLeagueMembers.map((lm) => (
                    <option key={lm.user_id} value={lm.user_id}>
                      {lm.username}
                    </option>
                  ))}
                </select>
                <span className="muted">or</span>
                <input
                  type="text"
                  placeholder="Username…"
                  value={s.manualUsername}
                  onChange={(e) => s.setManualUsername(e.target.value)}
                  disabled={s.working}
                  aria-label="Username"
                  style={{ maxWidth: 180 }}
                />
                <button
                  type="button"
                  onClick={() => void s.addMember()}
                  disabled={s.working}
                >
                  Add to season
                </button>
              </div>
              <p className="muted">
                You can add anyone by username; if they aren&apos;t already a league
                member, they&apos;ll be added to the league automatically.
              </p>
              <FormStatus loading={s.working} result={s.addMemberResult} />
            </>
          )}
        </div>

        <div className="card nested">
          <header className="header-with-controls">
            <div>
              <h3>Commissioner Controls</h3>
              <p className="muted">Scoring + invites. Draft must be pending.</p>
            </div>
          </header>
          {s.isArchived ? (
            <p className="muted">
              Archived season — scoring and invites are read-only. No edits allowed.
            </p>
          ) : (
            <div className="stack">
              <div className="pill-list">
                <span className="pill">Scoring: {s.scoringStrategy}</span>
                <span className="pill">
                  Leftovers: {allocationLabel(s.allocationStrategy)}
                </span>
              </div>
              <p className="muted">
                Scoring and leftovers are set when creating the season (editing coming
                later).
              </p>

              <div className="inline-form">
                <label className="field">
                  <span>Username to invite</span>
                  <input
                    name="username"
                    type="text"
                    value={s.userInviteQuery}
                    onChange={(e) => s.setUserInviteQuery(e.target.value)}
                    disabled={!s.canEdit || s.working}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void s.createUserInvite()}
                  disabled={!s.canEdit || s.working}
                >
                  Create invite
                </button>
              </div>
              <FormStatus loading={s.working} result={s.userInviteResult} />

              <div className="inline-form">
                <label className="field">
                  <span>Placeholder invite label</span>
                  <input
                    name="label"
                    type="text"
                    value={s.placeholderLabel}
                    onChange={(e) => s.setPlaceholderLabel(e.target.value)}
                    disabled={!s.canEdit || s.working}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void s.createPlaceholderInvite()}
                  disabled={!s.canEdit || s.working}
                >
                  Generate link
                </button>
              </div>
              <FormStatus loading={s.working} result={s.inviteResult} />

              {s.invites.length === 0 ? (
                <p className="muted">No invites created yet.</p>
              ) : (
                <div className="list">
                  {s.invites.map((invite) => (
                    <div key={invite.id} className="list-row">
                      <div>
                        <div className="pill-list">
                          <span className="pill">#{invite.id}</span>
                          <span className="pill">{invite.kind}</span>
                          <span
                            className={`pill ${invite.status === "REVOKED" ? "muted" : ""}`}
                          >
                            {invite.status}
                          </span>
                        </div>
                        <p className="muted">{invite.label ?? "No label"}</p>
                        <p className="muted">{s.buildInviteLink(invite.id)}</p>
                      </div>
                      <div className="pill-actions">
                        <button
                          type="button"
                          onClick={() => s.copyLink(invite.id)}
                          disabled={s.working}
                        >
                          Copy link
                        </button>
                        {invite.status !== "REVOKED" ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void s.revokeInvite(invite.id)}
                            disabled={s.working}
                          >
                            Revoke
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void s.regenerateInvite(invite.id)}
                          disabled={s.working}
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
