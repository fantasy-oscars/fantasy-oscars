import type { ApiResult } from "@/lib/types";
import type { Dispatch, SetStateAction } from "react";
import { Box, Button, Group, Modal, Select, Stack, TextInput } from "@ui";

export type CategoryTemplateDraft = {
  code: string;
  name: string;
  default_unit_kind: "FILM" | "PERFORMANCE" | "SONG";
  icon: string;
  icon_variant: "default" | "inverted";
};

export function CategoryTemplateEditorModal(props: {
  opened: boolean;
  title: string;
  working: boolean;
  iconCodes: string[];
  value: CategoryTemplateDraft | null;
  setValue: Dispatch<SetStateAction<CategoryTemplateDraft | null>>;
  status: ApiResult | null;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title={props.title}
      centered
      overlayProps={{ opacity: 0.35, blur: 2 }}
    >
      <Stack gap="sm">
        <TextInput
          label="Code"
          value={props.value?.code ?? ""}
          onChange={(e) => {
            const v = e.currentTarget.value;
            props.setValue((p) => (p ? { ...p, code: v } : p));
          }}
          placeholder="oscars-best-picture"
          disabled={props.working}
        />
        <TextInput
          label="Name"
          value={props.value?.name ?? ""}
          onChange={(e) => {
            const v = e.currentTarget.value;
            props.setValue((p) => (p ? { ...p, name: v } : p));
          }}
          placeholder="Best Picture"
          disabled={props.working}
        />
        <Select
          label="Default nominee type"
          value={props.value?.default_unit_kind ?? "FILM"}
          onChange={(v) =>
            props.setValue((p) =>
              p
                ? {
                    ...p,
                    default_unit_kind: (v ??
                      "FILM") as CategoryTemplateDraft["default_unit_kind"]
                  }
                : p
            )
          }
          disabled={props.working}
          data={[
            { value: "FILM", label: "Film" },
            { value: "SONG", label: "Song" },
            { value: "PERFORMANCE", label: "Performance" }
          ]}
        />
        <Select
          label="Icon"
          searchable
          value={props.value?.icon ?? ""}
          onChange={(v) => props.setValue((p) => (p ? { ...p, icon: v ?? "trophy" } : p))}
          data={props.iconCodes.map((code) => ({ value: code, label: code }))}
          disabled={props.working}
        />
        <Select
          label="Icon variant"
          value={props.value?.icon_variant ?? "default"}
          onChange={(v) =>
            props.setValue((p) =>
              p
                ? {
                    ...p,
                    icon_variant: (v ?? "default") as "default" | "inverted"
                  }
                : p
            )
          }
          disabled={props.working}
          data={[
            { value: "default", label: "Default" },
            { value: "inverted", label: "Inverted" }
          ]}
        />

        {props.status ? (
          <Box className={props.status.ok ? "status status-ok" : "status status-warning"}>
            {props.status.message}
          </Box>
        ) : null}

        <Group justify="flex-end" wrap="wrap">
          <Button variant="subtle" onClick={props.onClose} disabled={props.working}>
            Cancel
          </Button>
          <Button onClick={props.onSave} disabled={props.working}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
