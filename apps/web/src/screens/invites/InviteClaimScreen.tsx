import type { ApiResult } from "../../lib/types";
import { FormStatus } from "../../ui/forms";

export function InviteClaimScreen(props: {
  token?: string;
  loading: boolean;
  result: ApiResult | null;
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
}) {
  const { token, loading, result, onAccept, onDecline } = props;

  return (
    <section className="card">
      <header className="header-with-controls">
        <div>
          <h2>Invite</h2>
          <p>Claim a league invite.</p>
        </div>
      </header>
      <div className="stack">
        <p className="muted">
          You have been invited to join a league. Accept to join the season roster.
        </p>
        <div className="inline-actions">
          <button type="button" onClick={onAccept} disabled={loading}>
            {loading ? "Working..." : "Accept invite"}
          </button>
          <button type="button" className="ghost" onClick={onDecline} disabled={loading}>
            Decline
          </button>
        </div>
        <small className="muted">Invite: {token}</small>
        <FormStatus loading={loading} result={result} />
      </div>
    </section>
  );
}
