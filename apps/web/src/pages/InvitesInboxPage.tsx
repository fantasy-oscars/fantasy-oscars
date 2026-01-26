import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InboxInvite } from "../lib/types";
import { PageLoader } from "../ui/page-state";
import {
  acceptInboxInvite,
  declineInboxInvite,
  fetchInboxInvites,
  resolveInviteDestination
} from "../features/invites/inbox";

export function InvitesInboxPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<InboxInvite[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetchInboxInvites();
      if (!res.ok) {
        if (!cancelled) {
          setError(res.error ?? "Could not load invites");
          setLoading(false);
        }
        return;
      }
      if (!cancelled) {
        setInvites(res.data?.invites ?? []);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function accept(invite: InboxInvite) {
    const res = await acceptInboxInvite(invite.id);
    if (!res.ok) {
      setError(res.error ?? "Unable to accept invite");
      return;
    }
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    navigate(await resolveInviteDestination(invite), { replace: true });
  }

  async function decline(invite: InboxInvite) {
    const res = await declineInboxInvite(invite.id);
    if (!res.ok) {
      setError(res.error ?? "Unable to decline invite");
      return;
    }
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  if (loading) return <PageLoader label="Loading invites..." />;

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Invites</h2>
          <p className="muted">Accept or decline season invites sent to you.</p>
        </div>
      </header>
      {error && <div className="status status-error">{error}</div>}
      {invites.length === 0 ? (
        <p className="muted">No pending invites.</p>
      ) : (
        <div className="list">
          {invites.map((invite) => (
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
                <button type="button" onClick={() => void accept(invite)}>
                  Accept
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void decline(invite)}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
