import { useState, type FormEvent } from "react";
import { Box, Button, Divider, Group, Select, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import { circuitCategoryKindLabel } from "@/decisions/admin/circuit";
import type {
  CircuitCategory,
  CircuitCategoryTemplate
} from "@/orchestration/adminCircuit";
import { CircuitRenameForm } from "./CircuitRenameForm";

export type CircuitCategoryActions = {
  add: (templateId: number) => Promise<boolean>;
  rename: (categoryId: number, name: string) => Promise<boolean>;
  move: (categoryId: number, delta: -1 | 1) => void;
  remove: (categoryId: number) => void;
};

/**
 * The Circuit's own categories, each built from a category template. Adding
 * one copies the template's name, icon and kind.
 */
export function CircuitCategoriesCard(props: {
  categories: CircuitCategory[];
  templates: CircuitCategoryTemplate[];
  disabled: boolean;
  actions: CircuitCategoryActions;
}) {
  const { categories, templates, disabled, actions } = props;
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!templateId) return;
    if (await actions.add(Number(templateId))) setTemplateId(null);
  }

  return (
    <StandardCard component="section" aria-labelledby="circuit-categories-title">
      <Title order={3} variant="section" id="circuit-categories-title">
        Categories
      </Title>
      <Text className="muted">
        Build the Circuit&apos;s categories from category templates, then map each
        ceremony&apos;s categories to them below. Song templates are not offered.
      </Text>

      {categories.length === 0 ? (
        <Text className="muted" size="sm" mt="sm">
          No categories yet. Add one from a template.
        </Text>
      ) : (
        <Stack component="ol" gap="xs" mt="sm" className="fo-listReset">
          {categories.map((c, idx) => (
            <Box key={c.id} component="li">
              {renaming === c.id ? (
                <CircuitRenameForm
                  label="Category name"
                  initial={c.name}
                  disabled={disabled}
                  onSave={(name) => actions.rename(c.id, name)}
                  onClose={() => setRenaming(null)}
                />
              ) : (
                <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                  <Box miw="var(--fo-space-0)">
                    <Text fw="var(--fo-font-weight-bold)">{c.name}</Text>
                    <Text className="muted" size="sm">
                      {circuitCategoryKindLabel(c.kind)}
                    </Text>
                  </Box>
                  <Group className="inline-actions" wrap="wrap" gap="xs">
                    <Button
                      type="button"
                      variant="subtle"
                      disabled={disabled}
                      aria-label={`Rename ${c.name}`}
                      onClick={() => setRenaming(c.id)}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="subtle"
                      disabled={disabled || idx === 0}
                      aria-label={`Move ${c.name} up`}
                      onClick={() => actions.move(c.id, -1)}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      variant="subtle"
                      disabled={disabled || idx === categories.length - 1}
                      aria-label={`Move ${c.name} down`}
                      onClick={() => actions.move(c.id, 1)}
                    >
                      Move down
                    </Button>
                    <Button
                      type="button"
                      variant="subtle"
                      disabled={disabled}
                      aria-label={`Remove ${c.name}`}
                      onClick={() => actions.remove(c.id)}
                    >
                      Remove
                    </Button>
                  </Group>
                </Group>
              )}
            </Box>
          ))}
        </Stack>
      )}

      <Divider my="sm" />

      <Box component="form" onSubmit={submit} aria-label="Add a category">
        <Box className="grid grid-stackOnPhone">
          <Select
            label="Category template"
            placeholder="Choose a template"
            value={templateId}
            onChange={setTemplateId}
            searchable
            disabled={disabled}
            nothingFoundMessage="No matching templates"
            data={templates.map((t) => ({ value: String(t.id), label: t.name }))}
          />
        </Box>
        <Group className="inline-actions" mt="sm" wrap="wrap">
          <Button type="submit" disabled={disabled || !templateId}>
            Add category
          </Button>
        </Group>
      </Box>
    </StandardCard>
  );
}
