import { Box, Button, Group, Stack, Text, Title } from "@mantine/core";
import { useAuthContext } from "../auth/context";
import { StandardCard } from "../primitives";
import "../primitives/baseline.css";

export function AccountPage() {
  const { user, logout } = useAuthContext();
  return (
    <Box className="baseline-page">
      <Box className="baseline-pageInner">
        <Stack gap="md">
          <Box component="header">
            <Title order={2} className="baseline-textHeroTitle">
              Account
            </Title>
            <Text className="baseline-textBody">Manage your profile and security.</Text>
          </Box>

          <StandardCard component="section" aria-label="Account details">
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Text className="baseline-textMeta">Username</Text>
                <Text component="span" className="baseline-statusPill baseline-textMeta">
                  {user?.username ?? "—"}
                </Text>
              </Group>
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Text className="baseline-textMeta">Email</Text>
                <Text component="span" className="baseline-statusPill baseline-textMeta">
                  {user?.email ?? "—"}
                </Text>
              </Group>

              <Group justify="flex-start" mt="xs">
                <Button type="button" variant="outline" onClick={() => void logout()}>
                  Logout
                </Button>
              </Group>
            </Stack>
          </StandardCard>
        </Stack>
      </Box>
    </Box>
  );
}
