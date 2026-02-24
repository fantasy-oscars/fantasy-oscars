import { Button, Divider, Stack, Title } from "@ui";

export function SeasonManagementColumn(props: {
  isLocked: boolean;
  working: boolean;
  onOpenInvites: () => void;
  onOpenDraftSettings: () => void;
  onOpenDelete: () => void;
}) {
  const { isLocked, working, onOpenInvites, onOpenDraftSettings, onOpenDelete } = props;
  return (
    <Stack gap="sm">
      <Title order={3} className="baseline-textSectionHeader">
        Season management
      </Title>
      <Stack gap="xs">
        <Button
          variant="outline"
          onClick={onOpenInvites}
          disabled={isLocked}
          title={isLocked ? "Invites are locked once drafting starts" : undefined}
        >
          Manage invites
        </Button>
        <Button
          variant="outline"
          onClick={onOpenDraftSettings}
          disabled={isLocked}
          title={isLocked ? "Draft settings are locked once drafting starts" : undefined}
        >
          Adjust draft settings
        </Button>
      </Stack>
      <Divider my="sm" />
      <Title order={4} className="baseline-textSectionHeader">
        Danger zone
      </Title>
      <Button color="red" variant="outline" onClick={onOpenDelete} disabled={working}>
        Delete season
      </Button>
    </Stack>
  );
}
