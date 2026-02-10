import { Box, Divider, Group, Stack, Text, Title } from "@mantine/core";
import { CommissionerPill } from "../pills";

export function LeagueMembersSection(props: {
  members: Array<{ id: number; username: string; role: string }>;
}) {
  const { members } = props;
  return (
    <Stack gap="sm">
      <Title order={4}>Members</Title>
      <Divider />

      {members.length === 0 ? (
        <Text className="baseline-textBody">No members yet.</Text>
      ) : (
        <Stack component="ul" gap={0} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {members.map((m, idx) => (
            <Box key={m.id} component="li">
              <Group justify="space-between" align="center" wrap="wrap" py="sm">
                <Text className="baseline-textBody">{m.username}</Text>
                {m.role === "OWNER" ? <CommissionerPill /> : null}
              </Group>
              {idx === members.length - 1 ? null : <Divider />}
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

