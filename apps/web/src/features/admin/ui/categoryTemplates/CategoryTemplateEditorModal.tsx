import type { ApiResult, FieldErrors } from "@/lib/types";
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
  value: CategoryTemplateDraft | null;
  setValue: Dispatch<SetStateAction<CategoryTemplateDraft | null>>;
  status: ApiResult | null;
  fieldErrors: FieldErrors;
  onEditField: (name: string) => void;
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
          error={props.fieldErrors.code}
          value={props.value?.code ?? ""}
          onChange={(e) => {
            props.onEditField("code");
            const v = e.currentTarget.value;
            props.setValue((p) => (p ? { ...p, code: v } : p));
          }}
          placeholder="oscars-best-picture"
          disabled={props.working}
        />
        <TextInput
          label="Name"
          error={props.fieldErrors.name}
          value={props.value?.name ?? ""}
          onChange={(e) => {
            props.onEditField("name");
            const v = e.currentTarget.value;
            props.setValue((p) => (p ? { ...p, name: v } : p));
          }}
          placeholder="Best Picture"
          disabled={props.working}
        />
        <Select
          label="Default nominee type"
          error={props.fieldErrors.default_unit_kind}
          value={props.value?.default_unit_kind ?? "FILM"}
          onChange={(v) => {
            props.onEditField("default_unit_kind");
            props.setValue((p) =>
              p
                ? {
                    ...p,
                    default_unit_kind: (v ??
                      "FILM") as CategoryTemplateDraft["default_unit_kind"]
                  }
                : p
            );
          }}
          disabled={props.working}
          data={[
            { value: "FILM", label: "Film" },
            { value: "SONG", label: "Song" },
            { value: "PERFORMANCE", label: "Performance" }
          ]}
        />
        <TextInput
          label="Icon"
          error={props.fieldErrors.icon}
          value={props.value?.icon ?? ""}
          onChange={(e) => {
            props.onEditField("icon");
            const v = e.currentTarget.value;
            props.setValue((p) => (p ? { ...p, icon: v } : p));
          }}
          placeholder="trophy"
          disabled={props.working}
        />
        <Select
          label="Icon variant"
          error={props.fieldErrors.icon_variant}
          value={props.value?.icon_variant ?? "default"}
          onChange={(v) => {
            props.onEditField("icon_variant");
            props.setValue((p) =>
              p
                ? {
                    ...p,
                    icon_variant: (v ?? "default") as "default" | "inverted"
                  }
                : p
            );
          }}
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
