import { Box, Button, Divider, Group, Radio, Stack, Text, TextInput, Title } from "@ui";
import { StandardCard } from "@/primitives/cards/StandardCard";

import type { AdminFilmDuplicateGroup } from "@/orchestration/adminFilmsDuplicates";
import { formatFilmLabel } from "@/decisions/admin/film";

export type AdminFilmDuplicatesScreenProps = {
  query: string;
  setQuery: (v: string) => void;
  loading: boolean;
  status: { ok: true } | { ok: false; message: string } | null;
  groups: AdminFilmDuplicateGroup[];
  canonicalByGroup: Record<string, number>;
  setCanonicalForGroup: (normTitle: string, filmId: number) => void;
  onReload: () => void;
  onMergeGroup: (group: AdminFilmDuplicateGroup) => void;
};

export function AdminFilmDuplicatesScreen(props: AdminFilmDuplicatesScreenProps) {
  const {
    query,
    setQuery,
    loading,
    status,
    groups,
    canonicalByGroup,
    setCanonicalForGroup,
    onReload,
    onMergeGroup
  } = props;

  return (
    <Stack gap="md">
      <Stack gap="var(--fo-space-4)">
        <Title order={2} className="baseline-textHeroTitle">
          Films
        </Title>
        <Text className="baseline-textBody">
          Resolve duplicate film records and keep TMDB links consistent.
        </Text>
      </Stack>

      <Group align="flex-end" gap="sm" wrap="wrap">
        <Box className="fo-flexFieldMd">
          <TextInput
            label="Search duplicates"
            placeholder="Film title"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        </Box>
        <Button variant="default" loading={loading} onClick={onReload}>
          Search
        </Button>
      </Group>

      {status && !status.ok ? (
        <Text className="baseline-textBody">{status.message}</Text>
      ) : null}

      {groups.length === 0 ? (
        <Text className="baseline-textBody">No duplicate film titles found.</Text>
      ) : (
        <Stack gap="md">
          {groups.map((g) => {
            const canonicalId = canonicalByGroup[g.norm_title] ?? g.films[0]?.id ?? 0;
            return (
              <StandardCard key={g.norm_title}>
                <Stack gap="sm">
                  <Group justify="space-between" align="baseline" wrap="wrap">
                    <Title order={4} className="baseline-textCardTitle">
                      {g.films[0]?.title ?? "Duplicate title"}
                    </Title>
                    <Text className="baseline-textMeta">{g.count} films</Text>
                  </Group>
                  <Divider />
                  <Radio.Group
                    value={String(canonicalId)}
                    onChange={(val: string) =>
                      setCanonicalForGroup(g.norm_title, Number(val))
                    }
                    label={
                      <Text className="baseline-textMeta">
                        Choose the canonical film to keep
                      </Text>
                    }
                  >
                    <Stack gap="var(--fo-space-8)" mt="var(--fo-space-8)">
                      {g.films.map((f) => (
                        <Radio
                          key={f.id}
                          value={String(f.id)}
                          label={formatFilmLabel(f)}
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                  <Group justify="flex-end">
                    <Button
                      color="red"
                      variant="outline"
                      onClick={() => onMergeGroup(g)}
                      disabled={g.films.length < 2}
                    >
                      Merge duplicates…
                    </Button>
                  </Group>
                </Stack>
              </StandardCard>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
