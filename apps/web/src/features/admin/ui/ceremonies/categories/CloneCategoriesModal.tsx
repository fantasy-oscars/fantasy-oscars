import type { Dispatch, SetStateAction } from "react";
import { Box, Button, Group, Select, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";

export function CloneCategoriesModal(props: {
  working: boolean;
  canEdit: boolean;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: Dispatch<SetStateAction<string>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { working, canEdit, options, value, onChange, onCancel, onSubmit } = props;

  return (
    <Box className="modal-backdrop" role="presentation">
      <StandardCard
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Clone from ceremony"
      >
        <Title order={4}>Clone from ceremony</Title>
        <Text className="muted">Copy the category structure (no linkage).</Text>
        <Box className="status status-warning" role="status" mt="sm">
          This will replace all categories for the current ceremony.
        </Box>

        <Stack className="stack-sm" gap="sm" mt="sm">
          <Select
            label="Select a ceremony to clone categories from"
            placeholder="Search ceremonies..."
            searchable
            clearable
            value={value || null}
            onChange={(v) => onChange(v ?? "")}
            disabled={working || !canEdit}
            data={options}
          />
        </Stack>

        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="button" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={working || !canEdit}>
            Clone categories
          </Button>
        </Group>
      </StandardCard>
    </Box>
  );
}

