import { Button, Group, Modal, Stack, Text } from "@ui";

export function DeleteSeasonModal(props: {
  opened: boolean;
  onClose: () => void;
  working: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const { opened, onClose, working, onConfirm } = props;

  return (
    <Modal opened={opened} onClose={onClose} title="Delete season?" centered>
      <Stack gap="md">
        <Text>
          Delete this season? This cancels the season and blocks drafting. This cannot be
          undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => void onConfirm()}
            disabled={working}
          >
            Delete season
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

