import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useInviteClaimOrchestration } from "../orchestration/invites";
import { notify } from "../notifications";
import { PageError, PageLoader } from "../ui/page-state";

export function InviteClaimPage() {
  const { token } = useParams();
  const { loading, result, accept } = useInviteClaimOrchestration({ token });
  const navigate = useNavigate();

  function notifyInvitesChanged() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("fo:invites-changed"));
  }

  // This route is intentionally demoted: it resolves the token, then redirects to /invites.
  // (Do not maintain a standalone invite-claim UI here.)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      // "Resolve" the invite link by claiming it (placeholder invites) or accepting it (id-based).
      const res = await accept();
      if (cancelled) return;

      if (!res.ok) {
        // Redirect with non-blocking error context for the canonical /invites surface.
        navigate("/invites", { replace: true, state: { inviteClaimError: res.error } });
        return;
      }

      notifyInvitesChanged();
      notify({
        id: "invites.claim.accepted",
        severity: "success",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: "Invite accepted"
      });

      navigate("/invites", { replace: true, state: { inviteClaimed: true } });
    }
    void run();
    return () => {
      cancelled = true;
    };
    // accept is stable (useCallback) and includes `token` in its deps.
  }, [accept, navigate]);

  // Minimal fallback UI only (acts as an error boundary while redirecting).
  if (loading) return <PageLoader label="Opening invite..." />;
  if (result && !result.ok) return <PageError message={result.message} />;
  return <PageLoader label="Opening invite..." />;
}
