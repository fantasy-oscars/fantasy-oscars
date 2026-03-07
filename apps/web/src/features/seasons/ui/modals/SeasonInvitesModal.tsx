import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip
} from "@ui";
import type { SeasonInvite, SeasonMember } from "@/lib/types";
import { UserSearchCombobox } from "@/shared/comboboxes/UserSearchCombobox";
import { CommissionerPill } from "@/shared/pills";
import { useConfirm } from "@/notifications/confirm";

function IconBtn(props: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "ghost" | "danger";
}) {
  return (
    <Tooltip label={props.label} withArrow>
      <ActionIcon
        variant={props.variant ?? "ghost"}
        size="sm"
        onClick={props.onClick}
        disabled={props.disabled}
        aria-label={props.label}
      >
        <Text component="span" className="gicon" aria-hidden="true">
          {props.icon}
        </Text>
      </ActionIcon>
    </Tooltip>
  );
}

export function SeasonParticipantsModal(props: {
  opened: boolean;
  onClose: () => void;

  canEdit: boolean;
  working: boolean;
  locked: boolean;

  currentUserId: number;
  members: SeasonMember[];
  onRemoveMember: (userId: number) => void | Promise<void>;
  onTransferOwnership: (userId: number) => void | Promise<void>;
  onLeaveSeason: () => void | Promise<void>;

  userInviteQuery: string;
  userInviteSearching: boolean;
  userInviteMatches: Array<{ id: number; username: string }>;
  onChangeUserInviteQuery: (next: string) => void;
  onPickUserInvitee: (id: number, username: string) => void;
  onCreateUserInvite: () => void | Promise<void>;
  availableLeagueMemberCount: number;
  onInviteAllLeagueMembers: () => void | Promise<void>;

  placeholderLabel: string;
  onChangePlaceholderLabel: (next: string) => void;
  onCreatePlaceholderInvite: () => void | Promise<void>;

  invites: SeasonInvite[];
  onCopyLink: (inviteId: number) => void;
  onRevokeInvite: (inviteId: number) => void | Promise<void>;
  onRegenerateInvite: (inviteId: number) => void | Promise<void>;
}) {
  const {
    opened,
    onClose,
    canEdit,
    working,
    locked,
    currentUserId,
    members,
    onRemoveMember,
    onTransferOwnership,
    onLeaveSeason,
    userInviteQuery,
    userInviteSearching,
    userInviteMatches,
    onChangeUserInviteQuery,
    onPickUserInvitee,
    onCreateUserInvite,
    availableLeagueMemberCount,
    onInviteAllLeagueMembers,
    placeholderLabel,
    onChangePlaceholderLabel,
    onCreatePlaceholderInvite,
    invites,
    onCopyLink,
    onRevokeInvite,
    onRegenerateInvite
  } = props;

  const { confirm } = useConfirm();

  const visibleInvites = invites.filter(
    (invite) => invite.status !== "CLAIMED" && invite.status !== "DECLINED"
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Manage participants" centered>
      <Stack gap="md">
        {canEdit ? (
          <>
            <Group className="inline-form" wrap="wrap" align="flex-end">
              <UserSearchCombobox
                label="Username"
                value={userInviteQuery}
                disabled={working || locked}
                searching={Boolean(userInviteSearching)}
                options={userInviteMatches}
                onChange={onChangeUserInviteQuery}
                onPick={onPickUserInvitee}
              />
              <Stack gap="xs">
                <Button
                  type="button"
                  onClick={() => void onCreateUserInvite()}
                  disabled={working || locked}
                >
                  Create invite
                </Button>
                {availableLeagueMemberCount > 0 ? (
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => void onInviteAllLeagueMembers()}
                    disabled={working || locked}
                  >
                    Invite all league members
                  </Button>
                ) : null}
              </Stack>
            </Group>

            <Group className="inline-form" wrap="wrap" align="flex-end">
              <TextInput
                label="Placeholder invite label"
                name="label"
                value={placeholderLabel}
                onChange={(e) => onChangePlaceholderLabel(e.currentTarget.value)}
                disabled={working || locked}
              />
              <Button
                type="button"
                onClick={() => void onCreatePlaceholderInvite()}
                disabled={working || locked}
              >
                Generate link
              </Button>
            </Group>
          </>
        ) : null}

        <Divider label="Participants" labelPosition="left" />

        {members.length === 0 ? (
          <Text className="muted">No participants.</Text>
        ) : (
          <Stack className="list" gap="sm">
            {members.map((m) => (
              <Box key={m.id} className="list-row">
                <Group gap="xs" align="center" wrap="nowrap">
                  <Text size="sm">{m.username ?? `User ${m.user_id}`}</Text>
                  {m.role === "OWNER" ? <CommissionerPill /> : null}
                </Group>
                <Group gap="xs" align="center" wrap="nowrap">
                  {canEdit && m.role !== "OWNER" ? (
                    <IconBtn
                      label="Make commissioner"
                      icon="workspace_premium"
                      onClick={() => void onTransferOwnership(m.user_id)}
                      disabled={working}
                    />
                  ) : null}
                  {canEdit && m.role !== "OWNER" && m.user_id !== currentUserId ? (
                    <IconBtn
                      label="Remove"
                      icon="person_remove"
                      variant="danger"
                      onClick={() => void onRemoveMember(m.user_id)}
                      disabled={working}
                    />
                  ) : null}
                  {m.user_id === currentUserId && m.role !== "OWNER" ? (
                    <IconBtn
                      label="Leave season"
                      icon="exit_to_app"
                      variant="danger"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Leave season",
                          message:
                            "Are you sure you want to leave this season? You will need a new invite to rejoin.",
                          confirmLabel: "Leave season",
                          danger: true
                        });
                        if (ok) await onLeaveSeason();
                      }}
                      disabled={working || locked}
                    />
                  ) : null}
                </Group>
              </Box>
            ))}
          </Stack>
        )}

        <Divider label="Invites" labelPosition="left" />

        {visibleInvites.length === 0 ? (
          <Text className="muted">No pending invites.</Text>
        ) : (
          <Stack className="list" gap="sm">
            {visibleInvites.map((invite) => (
              <Box
                key={invite.id}
                className={["list-row", "season-invite-row"].join(" ")}
              >
                <Text className="season-invite-name">{invite.label ?? "No label"}</Text>
                <Group className="season-invite-actions" gap="xs" wrap="nowrap">
                  <IconBtn
                    label="Copy link"
                    icon="content_copy"
                    onClick={() => onCopyLink(invite.id)}
                    disabled={working}
                  />
                  {canEdit ? (
                    <IconBtn
                      label="Regenerate link"
                      icon="autorenew"
                      onClick={() => void onRegenerateInvite(invite.id)}
                      disabled={working}
                    />
                  ) : null}
                  {canEdit && invite.status !== "REVOKED" ? (
                    <IconBtn
                      label="Revoke"
                      icon="block"
                      variant="danger"
                      onClick={() => void onRevokeInvite(invite.id)}
                      disabled={working}
                    />
                  ) : null}
                </Group>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
