import { Button, Divider, Stack, Text, Title } from "@ui";

const LOCKED_NOTE_ID = "season-management-locked-note";
const DELETE_LOCKED_NOTE_ID = "season-management-delete-locked-note";

export function SeasonManagementColumn(props: {
  isLocked: boolean;
  isDeleteLocked: boolean;
  working: boolean;
  onOpenInvites: () => void;
  onOpenDraftSettings: () => void;
  onOpenDelete: () => void;
}) {
  const {
    isLocked,
    isDeleteLocked,
    working,
    onOpenInvites,
    onOpenDraftSettings,
    onOpenDelete
  } = props;
  const deleteDisabled = working || isDeleteLocked;
  return (
    <Stack gap="sm">
      <Title order={3} variant="section" className="baseline-textSectionHeader">
        Season management
      </Title>
      <Stack gap="xs">
        <Button
          variant="outline"
          onClick={onOpenInvites}
          disabled={isLocked}
          aria-describedby={isLocked ? LOCKED_NOTE_ID : undefined}
        >
          Manage participants
        </Button>
        <Button
          variant="outline"
          onClick={onOpenDraftSettings}
          disabled={isLocked}
          aria-describedby={isLocked ? LOCKED_NOTE_ID : undefined}
        >
          Adjust draft settings
        </Button>
        {isLocked ? (
          <Text id={LOCKED_NOTE_ID} variant="helper">
            Participants and draft settings are locked once drafting starts.
          </Text>
        ) : null}
      </Stack>
      <Divider my="sm" />
      <Title order={4} variant="section" className="baseline-textSectionHeader">
        Danger zone
      </Title>
      <Button
        variant="danger"
        onClick={onOpenDelete}
        disabled={deleteDisabled}
        aria-describedby={isDeleteLocked ? DELETE_LOCKED_NOTE_ID : undefined}
      >
        Delete season
      </Button>
      {isDeleteLocked ? (
        <Text id={DELETE_LOCKED_NOTE_ID} variant="helper">
          Completed drafts cannot be deleted.
        </Text>
      ) : null}
    </Stack>
  );
}
