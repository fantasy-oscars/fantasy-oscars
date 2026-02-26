import { Box, Button, Group, Modal, Stack, Text, TextInput } from "@ui";
import type { SeasonInvite } from "@/lib/types";
import { UserSearchCombobox } from "@/shared/comboboxes/UserSearchCombobox";

export function SeasonInvitesModal(props: {
  opened: boolean;
  onClose: () => void;

  canEdit: boolean;
  working: boolean;
  locked: boolean;

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
  const visibleInvites = invites.filter(
    (invite) => invite.status !== "CLAIMED" && invite.status !== "DECLINED"
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Manage invites" centered>
      <Stack gap="md">
        <Group className="inline-form" wrap="wrap" align="flex-end">
          <UserSearchCombobox
            label="Username"
            value={userInviteQuery}
            disabled={!canEdit || working || locked}
            searching={Boolean(userInviteSearching)}
            options={userInviteMatches}
            onChange={onChangeUserInviteQuery}
            onPick={onPickUserInvitee}
          />
          <Stack gap="xs">
            <Button
              type="button"
              onClick={() => void onCreateUserInvite()}
              disabled={!canEdit || working || locked}
            >
              Create invite
            </Button>
            {availableLeagueMemberCount > 0 ? (
              <Button
                type="button"
                variant="subtle"
                onClick={() => void onInviteAllLeagueMembers()}
                disabled={!canEdit || working || locked}
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
            disabled={!canEdit || working || locked}
          />
          <Button
            type="button"
            onClick={() => void onCreatePlaceholderInvite()}
            disabled={!canEdit || working || locked}
          >
            Generate link
          </Button>
        </Group>

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

                <Group className="season-invite-actions" wrap="wrap">
                  <Button
                    type="button"
                    onClick={() => onCopyLink(invite.id)}
                    disabled={working}
                  >
                    Copy link
                  </Button>
                  {invite.status !== "REVOKED" ? (
                    <Button
                      type="button"
                      variant="subtle"
                      onClick={() => void onRevokeInvite(invite.id)}
                      disabled={working}
                    >
                      Revoke
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => void onRegenerateInvite(invite.id)}
                    disabled={working}
                  >
                    Regenerate
                  </Button>
                </Group>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
