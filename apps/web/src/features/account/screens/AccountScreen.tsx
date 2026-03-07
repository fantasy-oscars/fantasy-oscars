import { useState } from "react";
import { Box, Button, Group, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import { DeleteAccountModal } from "@/features/account/ui/DeleteAccountModal";
import "@/primitives/baseline.css";

export function AccountScreen(props: {
  username: string | null;
  email: string | null;
  onLogout: () => void | Promise<void>;
  onDeleteAccount: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const { username, email, onLogout, onDeleteAccount } = props;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleteWorking(true);
    setDeleteError(null);
    const result = await onDeleteAccount();
    setDeleteWorking(false);
    if (!result.ok) {
      setDeleteError(result.error ?? "Something went wrong. Please try again.");
    }
  }

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
                  {username ?? "—"}
                </Text>
              </Group>
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Text className="baseline-textMeta">Email</Text>
                <Text component="span" className="baseline-statusPill baseline-textMeta">
                  {email ?? "—"}
                </Text>
              </Group>

              <Group justify="space-between" wrap="nowrap" mt="xs">
                <Button type="button" variant="outline" onClick={() => void onLogout()}>
                  Logout
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteOpen(true);
                  }}
                >
                  Delete account
                </Button>
              </Group>
            </Stack>
          </StandardCard>
        </Stack>
      </Box>

      <DeleteAccountModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        working={deleteWorking}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </Box>
  );
}
