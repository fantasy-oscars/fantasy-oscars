import { Button, Divider, Group, Stack, Title } from "@ui";
import { FormStatus } from "@/shared/forms";

export function LeagueManagementSection(props: {
  working: boolean;
  rosterStatus: { ok: boolean; message: string } | null;
  onOpenTransfer: () => void;
  onOpenDelete: () => void;
}) {
  const { working, rosterStatus, onOpenTransfer, onOpenDelete } = props;
  return (
    <Stack gap="sm">
      <Title order={4} variant="section">
        Management
      </Title>
      <Divider />

      <Group wrap="wrap">
        <Button type="button" variant="ghost" onClick={onOpenTransfer}>
          Transfer ownership
        </Button>
        <Button type="button" variant="danger" onClick={onOpenDelete}>
          Delete league
        </Button>
      </Group>

      <FormStatus loading={working} result={rosterStatus} />
    </Stack>
  );
}
