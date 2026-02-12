import { Button, Group, Modal, Stack, Text } from "@ui";

export function DeleteLeagueModal(props: {
  opened: boolean;
  onClose: () => void;
  working: boolean;
  onConfirm: () => void;
}) {
  const { opened, onClose, working, onConfirm } = props;

  return (
    <Modal opened={opened} onClose={onClose} title="Delete league?" centered>
      <Stack gap="sm">
        <Text className="baseline-textBody">
          Delete this league and all of its seasons. This cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" onClick={onConfirm} disabled={working}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

