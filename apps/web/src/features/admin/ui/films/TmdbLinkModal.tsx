import {
  Button,
  Combobox,
  Group,
  Image,
  InputBase,
  Modal,
  Stack,
  Text,
  type ComboboxStore
} from "@ui";
import type { FieldErrors } from "@/lib/types";
import type { TmdbFilmSearchResult } from "@/orchestration/admin/filmsIndex/orchestration";
import "@/primitives/baseline.css";

export type TmdbLinkEditorController = {
  editingFilm: { id: number; title: string; tmdb_id: number | null } | null;
  combobox: ComboboxStore;
  searchQuery: string;
  searchLoading: boolean;
  searchResults: TmdbFilmSearchResult[];
  tmdbInput: string;
  fieldErrors: FieldErrors;
  close: () => void;
  changeSearchQuery: (value: string) => void;
  pickResult: (value: string) => void;
  removeLink: () => void;
  save: () => void;
};

export function TmdbLinkModal(props: {
  editor: TmdbLinkEditorController;
  saving: boolean;
}) {
  const { editor, saving } = props;
  const { editingFilm: film, combobox } = editor;
  return (
    <Modal
      opened={Boolean(film)}
      onClose={editor.close}
      title="Link film to TMDB"
      centered
      size="md"
      overlayProps={{ opacity: 0.35, blur: 2 }}
    >
      <Stack gap="sm">
        <Text className="baseline-textBody">{film?.title ?? "Untitled film"}</Text>
        <Text className="baseline-textMeta">
          Saving hydrates film metadata from TMDB when available.
        </Text>
        <Combobox
          store={combobox}
          withinPortal
          position="bottom-start"
          middlewares={{ flip: true, shift: true }}
          onOptionSubmit={editor.pickResult}
        >
          <Combobox.Target>
            <InputBase
              label="TMDB search or id"
              error={editor.fieldErrors.search}
              component="input"
              placeholder="Search TMDB films or type id"
              value={editor.searchQuery}
              onChange={(e) => editor.changeSearchQuery(e.currentTarget.value)}
              onFocus={() => combobox.openDropdown()}
            />
          </Combobox.Target>
          <Combobox.Dropdown>
            <Combobox.Options>
              {editor.searchLoading ? (
                <Combobox.Empty>
                  <Text size="sm" className="muted">
                    Searching TMDB…
                  </Text>
                </Combobox.Empty>
              ) : editor.searchResults.length === 0 ? (
                <Combobox.Empty>
                  <Text size="sm" className="muted">
                    No TMDB matches
                  </Text>
                </Combobox.Empty>
              ) : (
                editor.searchResults.map((r) => (
                  <Combobox.Option
                    key={`tmdb-film-${r.tmdb_id}`}
                    value={String(r.tmdb_id)}
                  >
                    <Group gap="sm" align="flex-start" wrap="nowrap">
                      <Image
                        src={r.poster_url}
                        alt=""
                        className="fo-filmSearchPoster"
                        radius="sm"
                      />
                      <Stack gap="var(--fo-space-4)" className="fo-flex1Minw0">
                        <Text size="sm" fw="var(--fo-font-weight-semibold)" lineClamp={1}>
                          {r.title}
                        </Text>
                        <Text size="xs" className="muted">
                          {r.release_year ?? "Year unknown"}
                          {r.director ? ` · ${r.director}` : ""}
                        </Text>
                        {r.original_title && r.original_title !== r.title ? (
                          <Text size="xs" className="muted" lineClamp={1}>
                            Original title: {r.original_title}
                          </Text>
                        ) : null}
                        {r.linked_film_id ? (
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            Already linked to:{" "}
                            {r.linked_film_title ?? `Film #${r.linked_film_id}`}
                          </Text>
                        ) : null}
                      </Stack>
                    </Group>
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
        {editor.tmdbInput ? (
          <Text className="baseline-textMeta">Selected TMDB id: {editor.tmdbInput}</Text>
        ) : null}
        <Group justify="space-between" align="center">
          <Button
            variant="subtle"
            disabled={!film?.tmdb_id || saving}
            onClick={editor.removeLink}
          >
            Remove link
          </Button>
          <Button loading={saving} onClick={editor.save}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
