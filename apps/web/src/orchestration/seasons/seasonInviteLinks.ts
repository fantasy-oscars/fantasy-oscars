import { notify } from "../../notifications";

export function buildSeasonInviteLink(inviteId: number, token: string | undefined) {
  const pathToken = token ?? String(inviteId);
  return `${window.location.origin}/invites/${pathToken}`;
}

export function copySeasonInviteLink(args: { inviteId: number; token: string | undefined }) {
  const link = buildSeasonInviteLink(args.inviteId, args.token);
  void navigator.clipboard?.writeText(link);
  notify({
    id: "season.invite.link.copy.success",
    severity: "success",
    trigger_type: "user_action",
    scope: "local",
    durability: "ephemeral",
    requires_decision: false,
    message: "Link copied"
  });
  return link;
}

