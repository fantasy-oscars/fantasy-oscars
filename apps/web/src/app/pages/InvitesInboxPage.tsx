import { useNavigate } from "react-router-dom";
import type { InboxInvite } from "@/lib/types";
import { useInvitesInboxOrchestration } from "@/orchestration/invites";
import { InvitesInboxScreen } from "@/features/invites/screens/InvitesInboxScreen";
import { notify } from "@/notifications";

export function InvitesInboxPage() {
  const navigate = useNavigate();
  const { view, accept, decline, removeFromView } = useInvitesInboxOrchestration();

  function notifyInvitesChanged() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("fo:invites-changed"));
  }

  async function acceptInvite(invite: InboxInvite) {
    const res = await accept(invite);
    if (!res.ok) {
      if (res.errorCode === "NOT_FOUND") {
        removeFromView(invite.id);
        notifyInvitesChanged();
      }
      notify({
        id: "invites.inbox.accept.failed",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: res.error
      });
      return;
    }
    removeFromView(invite.id);
    notifyInvitesChanged();
    notify({
      id: "invites.inbox.accepted",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Invite accepted"
    });
    navigate(res.destination, { replace: true });
  }

  async function declineInvite(invite: InboxInvite) {
    const res = await decline(invite);
    if (!res.ok) {
      if (res.errorCode === "NOT_FOUND") {
        removeFromView(invite.id);
        notifyInvitesChanged();
      }
      notify({
        id: "invites.inbox.decline.failed",
        severity: "error",
        trigger_type: "user_action",
        scope: "local",
        durability: "ephemeral",
        requires_decision: false,
        message: res.error
      });
      return;
    }
    removeFromView(invite.id);
    notifyInvitesChanged();
    notify({
      id: "invites.inbox.declined",
      severity: "success",
      trigger_type: "user_action",
      scope: "local",
      durability: "ephemeral",
      requires_decision: false,
      message: "Invite declined"
    });
  }

  return (
    <InvitesInboxScreen
      view={view}
      onAccept={(i) => void acceptInvite(i)}
      onDecline={(i) => void declineInvite(i)}
    />
  );
}
