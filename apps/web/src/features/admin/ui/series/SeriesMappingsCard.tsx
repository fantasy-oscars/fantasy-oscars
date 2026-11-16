import { Box, Divider, Select, Stack, Text, Title } from "@ui";
import { StandardCard } from "@/primitives";
import { ceremonyLabel, groupEditionsByCeremony } from "@/decisions/admin/series";
import type {
  SeriesCategory,
  SeriesCategoryEdition,
  SeriesCeremony
} from "@/orchestration/adminSeries";

/**
 * Explicit mappings from each associated ceremony's categories to the eight
 * canonical Series categories. A category maps to at most one canonical
 * category; an empty choice leaves it out of the Series.
 */
export function SeriesMappingsCard(props: {
  ceremonies: SeriesCeremony[];
  editions: SeriesCategoryEdition[];
  categories: SeriesCategory[];
  disabled: boolean;
  onChange: (categoryEditionId: number, seriesCategoryId: number | null) => void;
}) {
  const groups = groupEditionsByCeremony(props.ceremonies, props.editions);
  const options = props.categories.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <StandardCard component="section" aria-labelledby="series-mappings-title">
      <Title order={3} variant="section" id="series-mappings-title">
        Category mappings
      </Title>
      <Text className="muted">
        Choose which Series category each ceremony category counts towards.
      </Text>

      {groups.length === 0 ? (
        <Text className="muted" size="sm" mt="sm">
          Add a ceremony to map its categories.
        </Text>
      ) : (
        <Stack gap="sm" mt="sm">
          {groups.map(({ ceremony, editions }, idx) => (
            <Box
              key={ceremony.ceremony_id}
              role="group"
              aria-label={ceremonyLabel(ceremony)}
            >
              {idx > 0 ? <Divider mb="sm" /> : null}
              <Text fw="var(--fo-font-weight-bold)">{ceremonyLabel(ceremony)}</Text>
              {editions.length === 0 ? (
                <Text className="muted" size="sm">
                  This ceremony has no categories yet.
                </Text>
              ) : (
                <Box className="grid grid-stackOnPhone">
                  {editions.map((e) => (
                    <Select
                      key={e.id}
                      label={e.name || e.code || `Category ${e.id}`}
                      placeholder="Not in the Series"
                      clearable
                      disabled={props.disabled}
                      value={
                        e.series_category_id === null
                          ? null
                          : String(e.series_category_id)
                      }
                      onChange={(v) =>
                        props.onChange(e.id, v === null ? null : Number(v))
                      }
                      data={options}
                    />
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </StandardCard>
  );
}
