import type { InboxInvite } from "../../lib/types";
import { PageLoader } from "../../ui/page-state";
import type { InvitesInboxView } from "../../orchestration/invites";

export function InvitesInboxScreen(props: {
  view: InvitesInboxView;
  onAccept: (invite: InboxInvite) => void | Promise<void>;
  onDecline: (invite: InboxInvite) => void | Promise<void>;
}) {
  const { view, onAccept, onDecline } = props;

  if (view.state === "loading") return <PageLoader label="Loading invites..." />;

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Invites</h2>
          <p className="muted">Accept or decline season invites sent to you.</p>
        </div>
      </header>
      {view.state === "error" && (
        <div className="status status-error">{view.message}</div>
      )}
      {view.state === "ready" && view.invites.length === 0 ? (
        <p className="muted">No pending invites.</p>
      ) : null}
      {view.state === "ready" && view.invites.length > 0 ? (
        <div className="list">
          {view.invites.map((invite) => (
            <div key={invite.id} className="list-row">
              <div>
                <div className="pill-list">
                  <span className="pill">#{invite.id}</span>
                  {invite.league_name && (
                    <span className="pill">{invite.league_name}</span>
                  )}
                  {invite.ceremony_id && (
                    <span className="pill">Ceremony {invite.ceremony_id}</span>
                  )}
                </div>
                <p className="muted">
                  Season {invite.season_id} • {invite.kind}
                </p>
              </div>
              <div className="pill-actions">
                <button type="button" onClick={() => void onAccept(invite)}>
                  Accept
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void onDecline(invite)}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
