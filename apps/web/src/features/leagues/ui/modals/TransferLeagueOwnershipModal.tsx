import { Button, Group, Modal, Select, Stack, Text } from "@ui";

export function TransferLeagueOwnershipModal(props: {
  opened: boolean;
  onClose: () => void;
  working: boolean;
  value: string | null;
  onChange: (next: string | null) => void;
  options: Array<{ value: string; label: string }>;
  onConfirm: () => void;
}) {
  const { opened, onClose, working, value, onChange, options, onConfirm } = props;

  return (
    <Modal opened={opened} onClose={onClose} title="Transfer ownership" centered>
      <Stack gap="sm">
        <Text className="baseline-textBody">
          Transfer league ownership to another member. The new commissioner will manage
          seasons and winners.
        </Text>
        <Select
          label="Member"
          placeholder="Select member"
          value={value}
          onChange={onChange}
          data={options}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!value || working}>
            Transfer ownership
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

