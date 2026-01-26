import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ApiResult } from "../lib/types";
import { FormStatus } from "../ui/forms";
import { acceptInvite, declineInvite } from "../features/invites/claim";

export function InviteClaimPage() {
  const { token } = useParams();
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function accept() {
    if (!token) {
      setResult({ ok: false, message: "Invalid invite link" });
      return;
    }
    setLoading(true);
    const res = await acceptInvite(token);
    setLoading(false);
    setResult({ ok: res.ok, message: res.message });
    if (!res.ok) return;
    if (res.seasonId) navigate(`/seasons/${res.seasonId}`, { replace: true });
    else navigate("/leagues", { replace: true });
  }

  async function decline() {
    if (!token) {
      setResult({ ok: false, message: "Invalid invite link" });
      return;
    }
    setLoading(true);
    const res = await declineInvite(token);
    setLoading(false);
    setResult({ ok: res.ok, message: res.message });
  }

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
          <button type="button" onClick={accept} disabled={loading}>
            {loading ? "Working..." : "Accept invite"}
          </button>
          <button type="button" className="ghost" onClick={decline} disabled={loading}>
            Decline
          </button>
        </div>
        <small className="muted">Invite: {token}</small>
        <FormStatus loading={loading} result={result} />
      </div>
    </section>
  );
}
