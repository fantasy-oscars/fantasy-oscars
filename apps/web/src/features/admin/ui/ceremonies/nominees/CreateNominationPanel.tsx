import { Box, Button, Group, Select, Stack, Text, TextInput } from "@ui";
import type { ApiResult } from "@/lib/types";
import { StandardCard } from "@/primitives";
import { FormStatus } from "@/shared/forms";
import { FilmCombobox } from "./FilmCombobox";
import { PeopleCombobox, type SelectedContributor } from "./PeopleCombobox";

export function CreateNominationPanel(props: {
  categories: Array<{ id: number; label: string }>;
  selectedCategoryId: number | null;
  setSelectedCategoryId: (next: number | null) => void;
  films: unknown[];
  filmInput: string;
  onFilmChange: (next: string) => void;
  onCreateUnlinkedFilm: (title: string) => void;
  onSelectTmdbFilmCandidate: (candidate: {
    tmdb_id: number;
    title: string;
    release_year: number | null;
  }) => void;
  onFilmPick: (film: {
    id: number;
    title: string;
    release_year?: number | null;
    tmdb_id?: number | null;
  }) => void;
  unitKind: string | null;
  songTitle: string;
  setSongTitle: (next: string) => void;
  requiresContributor: boolean;
  creditsLoading: boolean;
  creditsState: ApiResult | null;
  localContributorOptions: Array<{
    key: string;
    name: string;
    tmdb_id: number | null;
    label: string;
  }>;
  pendingContributorInput: string;
  setPendingContributorInput: (next: string) => void;
  selectedContributors: SelectedContributor[];
  onAddSelectedContributor: (contributor: SelectedContributor) => void;
  onRemoveSelectedContributor: (key: string) => void;
  manualLoading: boolean;
  manualState: ApiResult | null;
  onCreateNomination: () => void;
  onReset: () => void;
  checkIconChar: string;
}) {
  return (
    <StandardCard className="wizard-panel is-primary">
      <Stack className="stack-sm" gap="sm">
        <Text fw="var(--fo-font-weight-bold)">Create nominations</Text>

        <Group className="admin-add-row" align="flex-end" wrap="wrap">
          <Box className="fo-flexFieldSm">
            <Select
              label="Category"
              placeholder="Select…"
              searchable
              value={props.selectedCategoryId ? String(props.selectedCategoryId) : null}
              onChange={(v) => props.setSelectedCategoryId(v ? Number(v) : null)}
              data={props.categories.map((c) => ({
                value: String(c.id),
                label: c.label
              }))}
            />
          </Box>
          <Box className="fo-flexField2Lg">
            <FilmCombobox
              label="Film"
              value={props.filmInput}
              onChange={props.onFilmChange}
              onCreateUnlinked={props.onCreateUnlinkedFilm}
              onSelectTmdbCandidate={props.onSelectTmdbFilmCandidate}
              onSelectFilm={props.onFilmPick}
              films={props.films as never}
            />
          </Box>
        </Group>

        {props.unitKind === "SONG" ? (
          <TextInput
            label="Song title"
            value={props.songTitle}
            onChange={(e) => props.setSongTitle(e.currentTarget.value)}
          />
        ) : null}

        {props.requiresContributor ? (
          <Stack gap="sm" mt="xs">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap="xs" align="center" wrap="nowrap">
                <Text fw="var(--fo-font-weight-bold)">Contributor</Text>
                <Text
                  component="span"
                  className="gicon wizard-inline-check"
                  aria-hidden="true"
                >
                  {props.checkIconChar}
                </Text>
              </Group>
            </Group>

            {props.creditsState?.ok === false ? (
              <FormStatus loading={props.creditsLoading} result={props.creditsState} />
            ) : null}

            <Group className="admin-add-row" align="flex-end" wrap="wrap">
              <Box className="fo-flexFieldMd">
                <PeopleCombobox
                  label="Add contributor"
                  value={props.pendingContributorInput}
                  onChange={props.setPendingContributorInput}
                  localOptions={props.localContributorOptions}
                  onSelectContributor={props.onAddSelectedContributor}
                  disabled={props.manualLoading}
                />
              </Box>
            </Group>

            {props.selectedContributors.length > 0 ? (
              <Stack className="stack-sm" gap="xs">
                {props.selectedContributors.map((c) => (
                  <Box key={c.key} className="list-row">
                    <Box>
                      <Text fw="var(--fo-font-weight-bold)" span>
                        {c.name}
                      </Text>
                      {c.tmdb_id ? (
                        <Text className="muted" span>
                          {" "}
                          — TMDB {c.tmdb_id}
                        </Text>
                      ) : (
                        <Text className="muted" span>
                          {" "}
                          — Unlinked
                        </Text>
                      )}
                    </Box>
                    <Group className="inline-actions" wrap="wrap">
                      <Button
                        type="button"
                        variant="subtle"
                        onClick={() => props.onRemoveSelectedContributor(c.key)}
                      >
                        Remove
                      </Button>
                    </Group>
                  </Box>
                ))}
              </Stack>
            ) : null}
          </Stack>
        ) : null}

        <Group className="inline-actions" wrap="wrap">
          <Button
            type="button"
            onClick={props.onCreateNomination}
            disabled={props.manualLoading}
          >
            {props.manualLoading ? "Saving..." : "Add nomination"}
          </Button>
          <Button
            type="button"
            variant="subtle"
            onClick={props.onReset}
            disabled={props.manualLoading}
          >
            Reset
          </Button>
        </Group>

        {props.manualState?.ok === false ? (
          <FormStatus loading={props.manualLoading} result={props.manualState} />
        ) : null}
      </Stack>
    </StandardCard>
  );
}
