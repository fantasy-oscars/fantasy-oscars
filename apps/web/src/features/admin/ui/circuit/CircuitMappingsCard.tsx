import { Box, Button, Divider, Group, Select, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import {
  ceremonyLabel,
  effectiveMapping,
  groupEditionsByCeremony,
  isMappingUnsaved,
  mappedCeremonyCategories,
  pendingMappingChanges,
  type MappingChoices
} from "@/decisions/admin/circuit";
import type {
  CircuitCategory,
  CircuitCategoryEdition,
  CircuitCeremony
} from "@/orchestration/adminCircuit";

export type CircuitMappingActions = {
  choose: (categoryEditionId: number, circuitCategoryId: number | null) => void;
  save: () => void;
};

function editionLabel(e: CircuitCategoryEdition) {
  return e.name || e.code || `Category ${e.id}`;
}

/**
 * Explicit mappings from each ceremony category to a Circuit category. Any
 * number of ceremony categories may map to one Circuit category. A matching
 * template pre-selects a choice, and nothing is saved until the admin saves.
 */
export function CircuitMappingsCard(props: {
  ceremonies: CircuitCeremony[];
  editions: CircuitCategoryEdition[];
  categories: CircuitCategory[];
  choices: MappingChoices;
  disabled: boolean;
  actions: CircuitMappingActions;
}) {
  const { ceremonies, editions, categories, choices, disabled, actions } = props;
  const categoryIds = categories.map((c) => c.id);
  const groups = groupEditionsByCeremony(ceremonies, editions);
  const options = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const pending = pendingMappingChanges(editions, choices, categoryIds).length;
  const byCategory = mappedCeremonyCategories(categories, ceremonies, editions, choices);

  return (
    <StandardCard component="section" aria-labelledby="circuit-mappings-title">
      <Title order={3} variant="section" id="circuit-mappings-title">
        Category mappings
      </Title>
      <Text className="muted">
        Choose the Circuit category each ceremony category counts towards. Several
        categories of one ceremony can count towards the same Circuit category, and each
        of their winners counts. Matching templates are pre-selected; nothing is saved
        until you save.
      </Text>

      {categories.length === 0 || groups.length === 0 ? (
        <Text className="muted" size="sm" mt="sm">
          {categories.length === 0
            ? "Add a Circuit category to map ceremony categories to it."
            : "Add a ceremony to map its categories."}
        </Text>
      ) : (
        <>
          <Stack gap="sm" mt="sm">
            {groups.map(({ ceremony, editions: rows }, idx) => (
              <Box
                key={ceremony.ceremony_id}
                role="group"
                aria-label={ceremonyLabel(ceremony)}
              >
                {idx > 0 ? <Divider mb="sm" /> : null}
                <Text fw="var(--fo-font-weight-bold)">{ceremonyLabel(ceremony)}</Text>
                {rows.length === 0 ? (
                  <Text className="muted" size="sm">
                    This ceremony has no categories yet.
                  </Text>
                ) : (
                  <Box className="grid grid-minCell">
                    {rows.map((e) => {
                      const value = effectiveMapping(e, choices, categoryIds);
                      return (
                        <Select
                          key={e.id}
                          label={editionLabel(e)}
                          description={
                            isMappingUnsaved(e, choices, categoryIds)
                              ? "Not saved"
                              : undefined
                          }
                          placeholder="Not in the Circuit"
                          clearable
                          disabled={disabled}
                          value={value === null ? null : String(value)}
                          onChange={(v) =>
                            actions.choose(e.id, v === null ? null : Number(v))
                          }
                          data={options}
                        />
                      );
                    })}
                  </Box>
                )}
              </Box>
            ))}
          </Stack>

          <Group className="inline-actions" mt="sm" wrap="wrap" align="center">
            <Button type="button" onClick={actions.save} disabled={disabled || !pending}>
              Save mappings
            </Button>
            <Text className="muted" size="sm" role="status">
              {pending === 0
                ? "All mappings are saved."
                : pending === 1
                  ? "1 unsaved change."
                  : `${pending} unsaved changes.`}
            </Text>
          </Group>

          <Divider my="sm" />

          <Box role="group" aria-label="Mapped to each Circuit category">
            <Text fw="var(--fo-font-weight-bold)">By Circuit category</Text>
            <Stack component="ul" gap="xs" mt="xs" className="fo-listReset">
              {byCategory.map(({ category, mapped }) => (
                <Box key={category.id} component="li">
                  <Text>{category.name}</Text>
                  <Text className="muted" size="sm">
                    {mapped.length === 0
                      ? "Nothing mapped yet."
                      : mapped
                          .map(
                            (m) =>
                              `${ceremonyLabel(m.ceremony)} · ${editionLabel(m.edition)}${
                                m.unsaved ? " (not saved)" : ""
                              }`
                          )
                          .join("; ")}
                  </Text>
                </Box>
              ))}
            </Stack>
          </Box>
        </>
      )}
    </StandardCard>
  );
}
