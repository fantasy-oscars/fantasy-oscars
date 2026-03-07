import { Box, Button, Divider, Group, Stack, Text, Title } from "@ui";
import { CommissionerPill } from "@/shared/pills";
import { useConfirm } from "@/notifications/confirm";

export function SeasonParticipantsColumn(props: {
  members: Array<{
    id: number;
    user_id: number;
    username?: string | null;
    role: string;
  }>;
  canLeave?: boolean;
  working?: boolean;
  onLeaveSeason?: () => void | Promise<void>;
}) {
  const { members, canLeave, working, onLeaveSeason } = props;
  const { confirm } = useConfirm();
  return (
    <Stack gap="sm">
      <Title order={3}>Participants</Title>
      <Divider />
      {members.length === 0 ? (
        <Text className="muted">No participants.</Text>
      ) : (
        <Stack component="ul" gap="xs" className="fo-listReset">
          {members.map((m) => (
            <Box key={m.id} component="li">
              <Group justify="space-between" align="center" wrap="wrap">
                <Text>{m.username ?? `User ${m.user_id}`}</Text>
                {m.role === "OWNER" ? <CommissionerPill /> : null}
              </Group>
            </Box>
          ))}
        </Stack>
      )}
      {canLeave ? (
        <>
          <Divider />
          <Button
            color="red"
            variant="outline"
            disabled={Boolean(working)}
            onClick={async () => {
              const ok = await confirm({
                title: "Leave season",
                message:
                  "Are you sure you want to leave this season? You will need a new invite to rejoin.",
                confirmLabel: "Leave season",
                danger: true
              });
              if (ok) await onLeaveSeason?.();
            }}
          >
            Leave season
          </Button>
        </>
      ) : null}
    </Stack>
  );
}
