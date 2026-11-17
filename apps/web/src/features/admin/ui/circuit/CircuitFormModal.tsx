import type { FormEvent, ReactNode } from "react";
import { Box, Button, Group, Modal, Stack } from "@ui";

/** A small one-field form in a modal, for the Circuit editor's Add actions. */
export function CircuitFormModal(props: {
  opened: boolean;
  title: string;
  submitLabel: string;
  canSubmit: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    if (props.canSubmit) props.onSubmit();
  }
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={props.title}
      centered
      size="md"
      overlayProps={{ opacity: 0.35 }}
    >
      <Box component="form" onSubmit={submit} aria-label={props.title}>
        <Stack gap="md">
          {props.children}
          <Group justify="flex-end" gap="sm" wrap="wrap">
            <Button type="button" variant="subtle" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!props.canSubmit}>
              {props.submitLabel}
            </Button>
          </Group>
        </Stack>
      </Box>
    </Modal>
  );
}
