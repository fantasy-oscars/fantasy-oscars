import { useState, type FormEvent } from "react";
import { Box, Button, Divider, Group, Select, Stack, Text, Title } from "@ui";
import { EmptyState, StandardCard } from "@/primitives";
import { circuitCategoryKindLabel } from "@/decisions/admin/circuit";
import type {
  CircuitCategory,
  CircuitCategoryTemplate
} from "@/orchestration/adminCircuit";
import { CircuitRenameForm } from "./CircuitRenameForm";
import { CircuitRowIconButton } from "./CircuitRowIconButton";

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
        <Box mt="md">
          <EmptyState>No categories yet. Add one from a template.</EmptyState>
        </Box>
      ) : (
        <Stack component="ol" gap="sm" mt="md" className="fo-listReset">
          {categories.map((c, idx) => (
            <Box key={c.id} component="li">
              {idx > 0 ? <Divider mb="sm" /> : null}
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
                  <Box miw="var(--fo-layout-fieldMin-lg)" flex={1}>
                    <Text fw="var(--fo-font-weight-bold)">{c.name}</Text>
                    <Text className="muted" size="sm">
                      {circuitCategoryKindLabel(c.kind)}
                    </Text>
                  </Box>
                  <Group gap="xs" wrap="nowrap" ml="auto">
                    <CircuitRowIconButton
                      icon="edit"
                      label={`Rename ${c.name}`}
                      disabled={disabled}
                      onClick={() => setRenaming(c.id)}
                    />
                    <CircuitRowIconButton
                      icon="arrow_upward"
                      label={`Move ${c.name} up`}
                      disabled={disabled || idx === 0}
                      onClick={() => actions.move(c.id, -1)}
                    />
                    <CircuitRowIconButton
                      icon="arrow_downward"
                      label={`Move ${c.name} down`}
                      disabled={disabled || idx === categories.length - 1}
                      onClick={() => actions.move(c.id, 1)}
                    />
                    <CircuitRowIconButton
                      icon="delete"
                      label={`Remove ${c.name}`}
                      disabled={disabled}
                      onClick={() => actions.remove(c.id)}
                    />
                  </Group>
                </Group>
              )}
            </Box>
          ))}
        </Stack>
      )}

      <Divider my="md" />

      <Box component="form" onSubmit={submit} aria-label="Add a category">
        <Title order={4} variant="section" mb="xs">
          Add a category
        </Title>
        <Group align="end" wrap="wrap" gap="sm">
          <Box flex={1} miw="var(--fo-layout-fieldMin-md)">
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
          <Button type="submit" disabled={disabled || !templateId}>
            Add category
          </Button>
        </Group>
      </Box>
    </StandardCard>
  );
}
