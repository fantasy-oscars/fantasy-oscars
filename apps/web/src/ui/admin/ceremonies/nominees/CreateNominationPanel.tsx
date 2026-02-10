import { Box, Button, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import type { ApiResult } from "../../../../lib/types";
import { StandardCard } from "../../../../primitives";
import { FormStatus } from "../../../forms";
import { FilmCombobox } from "./FilmCombobox";

export function CreateNominationPanel(props: {
  categories: Array<{ id: number; label: string }>;
  selectedCategoryId: number | null;
  setSelectedCategoryId: (next: number | null) => void;
  films: unknown[];
  filmInput: string;
  onFilmChange: (next: string) => void;
  unitKind: string | null;
  songTitle: string;
  setSongTitle: (next: string) => void;
  requiresContributor: boolean;
  hasTmdbCredits: boolean;
  creditsLoading: boolean;
  creditsState: ApiResult | null;
  creditOptions: Array<{ tmdb_id: number; label: string }>;
  pendingContributorId: string;
  setPendingContributorId: (next: string) => void;
  onAddPendingContributor: () => void;
  selectedCredits: Array<{ tmdb_id: number; name: string; jobs: string[] }>;
  onRemoveSelectedContributor: (tmdbId: number) => void;
  manualLoading: boolean;
  manualState: ApiResult | null;
  onCreateNomination: () => void;
  onReset: () => void;
  checkIconChar: string;
}) {
  return (
    <StandardCard className="wizard-panel is-primary">
      <Stack className="stack-sm" gap="sm">
        <Text fw={700}>Create nominations</Text>

        <Group className="admin-add-row" align="flex-end" wrap="wrap">
          <Box style={{ flex: "1 1 260px", minWidth: 220 }}>
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
          <Box style={{ flex: "2 1 420px", minWidth: 260 }}>
            <FilmCombobox
              label="Film"
              value={props.filmInput}
              onChange={props.onFilmChange}
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
                <Text fw={700}>Contributor</Text>
                {props.hasTmdbCredits ? (
                  <Text
                    component="span"
                    className="gicon wizard-inline-check"
                    aria-hidden="true"
                  >
                    {props.checkIconChar}
                  </Text>
                ) : null}
              </Group>
            </Group>

            {props.creditsState?.ok === false ? (
              <FormStatus loading={props.creditsLoading} result={props.creditsState} />
            ) : null}

            <Group className="admin-add-row" align="flex-end" wrap="wrap">
              <Box style={{ flex: "1 1 360px", minWidth: 240 }}>
                <Select
                  label="Select a person"
                  placeholder="Select…"
                  searchable
                  value={props.pendingContributorId || null}
                  onChange={(v) => props.setPendingContributorId(v ?? "")}
                  data={props.creditOptions.map((o) => ({
                    value: String(o.tmdb_id),
                    label: o.label
                  }))}
                  disabled={!props.hasTmdbCredits}
                />
              </Box>
              <Button
                type="button"
                onClick={props.onAddPendingContributor}
                disabled={
                  !props.pendingContributorId ||
                  props.manualLoading ||
                  !props.hasTmdbCredits
                }
              >
                Add
              </Button>
            </Group>

            {props.selectedCredits.length > 0 ? (
              <Stack className="stack-sm" gap="xs">
                {props.selectedCredits.map((c) => (
                  <Box key={c.tmdb_id} className="list-row">
                    <Box>
                      <Text fw={700} span>
                        {c.name}
                      </Text>
                      <Text className="muted" span>
                        {" "}
                        — {c.jobs.join(", ")}
                      </Text>
                    </Box>
                    <Group className="inline-actions" wrap="wrap">
                      <Button
                        type="button"
                        variant="subtle"
                        onClick={() => props.onRemoveSelectedContributor(c.tmdb_id)}
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
          <Button type="button" onClick={props.onCreateNomination} disabled={props.manualLoading}>
            {props.manualLoading ? "Saving..." : "Add nomination"}
          </Button>
          <Button type="button" variant="subtle" onClick={props.onReset} disabled={props.manualLoading}>
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

