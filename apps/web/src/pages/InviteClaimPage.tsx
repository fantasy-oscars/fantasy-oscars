import { useNavigate, useParams } from "react-router-dom";
import { useInviteClaimOrchestration } from "../orchestration/invites";
import { InviteClaimScreen } from "../screens/invites/InviteClaimScreen";

export function InviteClaimPage() {
  const { token } = useParams();
  const { loading, result, accept, decline } = useInviteClaimOrchestration({ token });
  const navigate = useNavigate();

  async function acceptAndRedirect() {
    const res = await accept();
    if (!res.ok) return;
    if ("seasonId" in res && res.seasonId)
      navigate(`/seasons/${res.seasonId}`, { replace: true });
    else navigate("/leagues", { replace: true });
  }

  return (
    <InviteClaimScreen
      token={token}
      loading={loading}
      result={result}
      onAccept={() => void acceptAndRedirect()}
      onDecline={() => void decline()}
    />
  );
}
