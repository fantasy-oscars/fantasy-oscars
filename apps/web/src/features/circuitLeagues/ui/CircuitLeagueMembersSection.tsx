import { Box, Button, Divider, Group, Stack, Text, Title } from "@ui";
import { FormStatus } from "@/shared/forms";
import { PlayerName } from "@/shared/PlayerName";
import { circuitLeagueMemberCountLabel } from "@/decisions/circuitLeague";
import type { ApiResult, CircuitLeagueMember } from "@/lib/types";

const LOCK_NOTE_ID = "circuit-league-lock-note";

export function CircuitLeagueMembersSection(props: {
  members: CircuitLeagueMember[];
  open: boolean;
  canManage: boolean;
  acting: boolean;
  lockStatus: ApiResult | null;
  onInitialize: () => void;
}) {
  const { members, open, canManage, acting, lockStatus } = props;
  return (
    <Stack gap="sm" component="section" aria-labelledby="circuit-league-members">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={3} variant="section" id="circuit-league-members">
          Members
        </Title>
        <Text variant="meta">{circuitLeagueMemberCountLabel(members.length)}</Text>
      </Group>
      <Divider />

      {members.length === 0 ? (
        <Text className="baseline-textBody">No members yet.</Text>
      ) : (
        <Stack component="ul" gap="var(--fo-space-0)" className="fo-listReset">
          {members.map((m, idx) => (
            <Box key={m.user_id} component="li">
              <Box py="var(--fo-space-dense-2)">
                <PlayerName
                  name={m.username}
                  avatarKey={m.avatar_key}
                  density="roomy"
                  wrap="anywhere"
                />
              </Box>
              {idx === members.length - 1 ? null : <Divider />}
            </Box>
          ))}
        </Stack>
      )}

      {open && canManage ? (
        // Locking cannot be undone, so it sits apart from joining and leaving.
        <Stack
          gap="sm"
          component="section"
          aria-labelledby="circuit-league-commissioner"
          mt="md"
        >
          <Title order={4} variant="section" id="circuit-league-commissioner">
            Commissioner
          </Title>
          <Divider />
          <Text id={LOCK_NOTE_ID} variant="helper">
            Locking closes membership and freezes events, roster and scoring. It cannot be
            undone.
          </Text>
          <Group>
            <Button
              variant="outline"
              onClick={props.onInitialize}
              disabled={acting || members.length === 0}
              aria-describedby={LOCK_NOTE_ID}
            >
              Lock season
            </Button>
          </Group>
          <FormStatus loading={false} result={lockStatus} />
        </Stack>
      ) : null}
    </Stack>
  );
}
