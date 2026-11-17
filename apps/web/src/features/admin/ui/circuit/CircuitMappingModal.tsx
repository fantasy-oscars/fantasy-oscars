import { useState } from "react";
import { Box, Button, Group, Modal, MultiSelect, Stack, Text } from "@ui";
import { EmptyState } from "@/primitives";
import {
  chooseMappingRow,
  mappingModalRows,
  pendingMappingChanges,
  type MappingChoices
} from "@/decisions/admin/circuit";
import type {
  CircuitCategory,
  CircuitCategoryEdition
} from "@/orchestration/adminCircuit";

function editionLabel(e: CircuitCategoryEdition) {
  return e.name || e.code || `Category ${e.id}`;
}

/**
 * Maps one ceremony's categories to the Circuit's: one row per Circuit
 * category, each with a multi-select of the ceremony's categories. Several
 * may feed one Circuit category; each feeds at most one, so a category chosen
 * in one row leaves the other rows' options. Template matches are
 * pre-selected, and nothing is saved until the admin saves.
 */
export function CircuitMappingModal(props: {
  ceremonyLabel: string;
  categories: CircuitCategory[];
  editions: CircuitCategoryEdition[];
  disabled: boolean;
  onClose: () => void;
  onSave: (choices: MappingChoices) => Promise<boolean>;
}) {
  const { categories, editions, disabled } = props;
  const [choices, setChoices] = useState<MappingChoices>({});
  const [saving, setSaving] = useState(false);
  const categoryIds = categories.map((c) => c.id);
  const rows = mappingModalRows(categoryIds, editions, choices);
  const pending = pendingMappingChanges(editions, choices, categoryIds).length;

  async function save() {
    setSaving(true);
    const ok = await props.onSave(choices);
    setSaving(false);
    if (ok) props.onClose();
  }

  return (
    <Modal
      opened
      onClose={props.onClose}
      title={`Map categories: ${props.ceremonyLabel}`}
      centered
      size="lg"
      overlayProps={{ opacity: 0.35 }}
    >
      <Stack gap="md">
        <Text className="muted" size="sm">
          Choose the ceremony categories that count towards each Circuit category. Each of
          their winners counts. Matching templates are pre-selected; nothing is saved
          until you save.
        </Text>
        {categories.length === 0 || editions.length === 0 ? (
          <EmptyState>
            {categories.length === 0
              ? "Add a Circuit category on the Categories tab first."
              : "This ceremony has no categories yet."}
          </EmptyState>
        ) : (
          <Stack gap="sm" role="list" aria-label="Circuit categories">
            {rows.map((row) => {
              const category = categories.find((c) => c.id === row.circuitCategoryId)!;
              return (
                <Box key={category.id} role="listitem">
                  <MultiSelect
                    label={category.name}
                    placeholder={row.selected.length ? undefined : "Nothing mapped"}
                    value={row.selected.map((e) => String(e.id))}
                    onChange={(values) =>
                      setChoices((prev) =>
                        chooseMappingRow(
                          editions,
                          prev,
                          categoryIds,
                          category.id,
                          values.map(Number)
                        )
                      )
                    }
                    disabled={disabled || saving}
                    searchable
                    clearable
                    comboboxProps={{ withinPortal: true }}
                    nothingFoundMessage="Every category is mapped elsewhere"
                    data={row.options.map((e) => ({
                      value: String(e.id),
                      label: editionLabel(e)
                    }))}
                  />
                </Box>
              );
            })}
          </Stack>
        )}
        <Group justify="space-between" align="center" gap="sm" wrap="wrap">
          <Text className="muted" size="sm" role="status">
            {pending === 0
              ? "All mappings are saved."
              : pending === 1
                ? "1 unsaved change."
                : `${pending} unsaved changes.`}
          </Text>
          <Group gap="sm" wrap="wrap">
            <Button type="button" variant="subtle" onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={disabled || saving || pending === 0}
            >
              {saving ? "Saving..." : "Save mappings"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
