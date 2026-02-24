import { Button, Group, Modal, Stack, Text } from "@ui";

export function WinnersConfirmOverlay(props: {
  ariaLabel: string;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      opened
      onClose={props.onCancel}
      centered
      title={props.title}
      aria-label={props.ariaLabel}
    >
      <Stack gap="md">
        <Text className="muted">{props.message}</Text>
        <Group justify="flex-end" wrap="wrap">
          <Button type="button" onClick={props.onCancel}>
            {props.cancelLabel}
          </Button>
          <Button type="button" variant="subtle" onClick={props.onConfirm}>
            {props.confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
