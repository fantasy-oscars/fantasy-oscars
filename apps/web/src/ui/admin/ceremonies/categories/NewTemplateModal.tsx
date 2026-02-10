import type { Dispatch, SetStateAction } from "react";
import { Box, Button, Checkbox, Group, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { StandardCard } from "../../../../primitives";

export type NewTemplateDraft = {
  code: string;
  name: string;
  default_unit_kind: "FILM" | "SONG" | "PERFORMANCE";
  icon_id: string;
  icon_variant: "default" | "inverted";
  add_to_ceremony: boolean;
};

export function NewTemplateModal(props: {
  working: boolean;
  canAddToCeremony: boolean;
  value: NewTemplateDraft;
  onChange: Dispatch<SetStateAction<NewTemplateDraft>>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { working, canAddToCeremony, value, onChange, onCancel, onSubmit } = props;
  return (
    <Box className="modal-backdrop" role="presentation">
      <StandardCard className="modal" role="dialog" aria-modal="true" aria-label="New template">
        <Title order={4}>New template</Title>
        <Text className="muted">
          Create a category template, then add it to ceremonies as needed.
        </Text>

        <Stack className="stack-sm" gap="sm" mt="sm">
          <TextInput
            label="Code"
            value={value.code}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange((p) => ({ ...p, code: v }));
            }}
            placeholder="oscar-best-picture"
            disabled={working}
          />
          <TextInput
            label="Name"
            value={value.name}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange((p) => ({ ...p, name: v }));
            }}
            placeholder="Best Picture"
            disabled={working}
          />
          <Select
            label="Default nominee type"
            value={value.default_unit_kind}
            onChange={(v) =>
              onChange((p) => ({
                ...p,
                default_unit_kind: (v ?? "FILM") as NewTemplateDraft["default_unit_kind"]
              }))
            }
            disabled={working}
            data={[
              { value: "FILM", label: "Film" },
              { value: "SONG", label: "Song" },
              { value: "PERFORMANCE", label: "Performance" }
            ]}
          />
          <TextInput
            label="Icon"
            value={value.icon_id}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange((p) => ({ ...p, icon_id: v }));
            }}
            placeholder="trophy"
            disabled={working}
          />
          <Select
            label="Icon variant"
            value={value.icon_variant}
            onChange={(v) =>
              onChange((p) => ({
                ...p,
                icon_variant: (v ?? "default") as "default" | "inverted"
              }))
            }
            disabled={working}
            data={[
              { value: "default", label: "Default" },
              { value: "inverted", label: "Inverted" }
            ]}
          />
          <Checkbox
            label="Add to this ceremony"
            checked={value.add_to_ceremony}
            onChange={(e) =>
              onChange((p) => ({ ...p, add_to_ceremony: e.currentTarget.checked }))
            }
            disabled={working || !canAddToCeremony}
          />
        </Stack>

        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="button" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={working}>
            Create template
          </Button>
        </Group>
      </StandardCard>
    </Box>
  );
}

