import { useState, type FormEvent } from "react";
import { Box, Button, Group, TextInput } from "@ui";

/** Inline rename of an event or a Circuit category; closes once the save succeeds. */
export function CircuitRenameForm(props: {
  label: string;
  initial: string;
  disabled: boolean;
  onSave: (name: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(props.initial);
  const canSave = name.trim() !== "" && name.trim() !== props.initial && !props.disabled;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    if (await props.onSave(name)) props.onClose();
  }

  return (
    <Box component="form" onSubmit={submit} aria-label={props.label}>
      <Group align="end" wrap="wrap" gap="xs">
        <Box flex={1} miw="var(--fo-layout-fieldMin-md)">
          <TextInput
            label={props.label}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            disabled={props.disabled}
          />
        </Box>
        <Group gap="xs" wrap="nowrap">
          <Button type="submit" disabled={!canSave}>
            Save
          </Button>
          <Button type="button" variant="subtle" onClick={props.onClose}>
            Cancel
          </Button>
        </Group>
      </Group>
    </Box>
  );
}
