import { useNavigate } from "react-router-dom";
import type { InboxInvite } from "../lib/types";
import { useInvitesInboxOrchestration } from "../orchestration/invites";
import { InvitesInboxScreen } from "../screens/invites/InvitesInboxScreen";

export function InvitesInboxPage() {
  const navigate = useNavigate();
  const { view, accept, decline, removeFromView } = useInvitesInboxOrchestration();

  async function acceptInvite(invite: InboxInvite) {
    const res = await accept(invite);
    if (!res.ok) return;
    removeFromView(invite.id);
    navigate(res.destination, { replace: true });
  }

  async function declineInvite(invite: InboxInvite) {
    const res = await decline(invite);
    if (!res.ok) return;
    removeFromView(invite.id);
  }

  return (
    <InvitesInboxScreen
      view={view}
      onAccept={(i) => void acceptInvite(i)}
      onDecline={(i) => void declineInvite(i)}
    />
  );
}
