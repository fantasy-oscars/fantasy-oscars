import { Button, Group, Modal, Stack, Text } from "@ui";

export function ConfirmDeleteCeremonyModal(props: {
  opened: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onCancel}
      title="Delete ceremony?"
      centered
    >
      <Stack gap="md">
        <Text className="baseline-textBody" c="dimmed">
          This ceremony is published. Deleting it will remove it for everyone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button color="red" onClick={props.onConfirm}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
