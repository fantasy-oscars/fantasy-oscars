import { Box, Divider, Group, Stack, Text, Title } from "@ui";
import { CommissionerPill } from "../pills";

export function SeasonParticipantsColumn(props: {
  members: Array<{
    id: number;
    user_id: number;
    username?: string | null;
    role: string;
  }>;
}) {
  const { members } = props;
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
    </Stack>
  );
}
