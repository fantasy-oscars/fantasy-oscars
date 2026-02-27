import {
  ActionIcon,
  Box,
  Button,
  Combobox,
  Group,
  Image,
  InputBase,
  Stack,
  Text,
  useCombobox
} from "@ui";
import { useEffect, useState } from "react";
import { notify } from "@/notifications";
import { NominationFilmLinkConflictModal } from "@/features/admin/ui/ceremonies/nominees/NominationFilmLinkConflictModal";
import { fetchJson } from "@/lib/api";
import { normalizeFilmTitleForTmdbQuery } from "@/lib/films";

export function NominationEditFilmSection(props: {
  nominationFilmTitle: string;
  film: null | { id: number; title: string; tmdb_id?: number | null };
  onLinkFilm: (
    filmId: number,
    tmdbId: number | null
  ) => Promise<
    | { ok: true; hydrated: boolean }
    | {
        ok: false;
        hydrated: boolean;
        error: string;
        errorCode?: string;
        errorDetails?: Record<string, unknown>;
      }
  >;
  onAfterLinkChange: () => void;
}) {
  const tmdbCombobox = useCombobox({
    onDropdownClose: () => tmdbCombobox.resetSelectedOption()
  });
  const { film, nominationFilmTitle, onLinkFilm, onAfterLinkChange } = props;

  const filmId = film?.id ?? null;
  const filmLinked = Boolean(film?.tmdb_id);

  const [filmLinkOpen, setFilmLinkOpen] = useState(false);
  const [filmTmdbId, setFilmTmdbId] = useState("");
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState("");
  const [tmdbSearchLoading, setTmdbSearchLoading] = useState(false);
  const [tmdbSearchResults, setTmdbSearchResults] = useState<
    Array<{
      tmdb_id: number;
      title: string;
      original_title: string | null;
      release_year: number | null;
      poster_url: string | null;
      director: string | null;
      linked_film_id: number | null;
      linked_film_title: string | null;
    }>
  >([]);
  const [filmLinkConflict, setFilmLinkConflict] = useState<{
    tmdbId: number;
    linkedFilmId: number;
    linkedFilmTitle: string | null;
  } | null>(null);

  useEffect(() => {
    if (!filmLinkOpen) {
      setTmdbSearchResults([]);
      setTmdbSearchLoading(false);
      return;
    }
    const q = tmdbSearchQuery.trim();
    if (!q || q.length < 2 || /^[0-9]+$/.test(q)) {
      setTmdbSearchResults([]);
      setTmdbSearchLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTmdbSearchLoading(true);
      void fetchJson<{
        results: Array<{
          tmdb_id: number;
          title: string;
          original_title: string | null;
          release_year: number | null;
          poster_url: string | null;
          director: string | null;
          linked_film_id: number | null;
          linked_film_title: string | null;
        }>;
      }>(`/admin/films/tmdb-search?q=${encodeURIComponent(q)}`, { method: "GET" }).then(
        (res) => {
          if (cancelled) return;
          setTmdbSearchLoading(false);
          if (!res.ok) {
            setTmdbSearchResults([]);
            return;
          }
          setTmdbSearchResults(res.data?.results ?? []);
        }
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filmLinkOpen, tmdbSearchQuery]);

  return (
    <Box>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text fw="var(--fo-font-weight-bold)">Film</Text>
        {filmId ? (
          <Group gap="xs" wrap="nowrap">
            {!filmLinked ? (
              <Text
                component="span"
                className="gicon muted"
                aria-label="Film not linked to TMDB"
              >
                link_off
              </Text>
            ) : null}
            <ActionIcon
              variant="subtle"
              aria-label="Link film to TMDB"
              onClick={() => {
                const querySeed = normalizeFilmTitleForTmdbQuery(
                  film?.title ?? nominationFilmTitle
                );
                setFilmLinkOpen((v) => !v);
                setFilmTmdbId(film?.tmdb_id ? String(film.tmdb_id) : "");
                setTmdbSearchQuery(querySeed);
              }}
            >
              <Text component="span" className="gicon" aria-hidden="true">
                add_link
              </Text>
            </ActionIcon>
          </Group>
        ) : null}
      </Group>

      <Text className="muted" size="sm">
        {film ? film.title : nominationFilmTitle}
      </Text>
      <Text className="muted" size="xs">
        Changes here affect every nomination that references this film.
      </Text>

      {filmId && filmLinkOpen ? (
        <Group mt="xs" align="flex-end" wrap="wrap">
          <Combobox
            store={tmdbCombobox}
            withinPortal
            position="bottom-start"
            middlewares={{ flip: true, shift: true }}
            onOptionSubmit={(value) => {
              const picked = tmdbSearchResults.find((r) => String(r.tmdb_id) === value);
              if (!picked) return;
              if (picked.linked_film_id && picked.linked_film_id !== filmId) {
                notify({
                  id: `admin.nominees.film.tmdb.search.linked.${picked.tmdb_id}`,
                  severity: "warning",
                  trigger_type: "user_action",
                  scope: "local",
                  durability: "ephemeral",
                  requires_decision: false,
                  title: "Already linked",
                  message: picked.linked_film_title
                    ? `TMDB ${picked.tmdb_id} is already linked to ${picked.linked_film_title}.`
                    : `TMDB ${picked.tmdb_id} is already linked.`
                });
                return;
              }
              setFilmTmdbId(String(picked.tmdb_id));
              setTmdbSearchQuery(picked.title);
              tmdbCombobox.closeDropdown();
            }}
          >
            <Combobox.Target>
              <InputBase
                label="TMDB search or id"
                component="input"
                placeholder="Search TMDB films or type id"
                value={tmdbSearchQuery}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  setTmdbSearchQuery(next);
                  const trimmed = next.trim();
                  if (/^[0-9]+$/.test(trimmed)) setFilmTmdbId(trimmed);
                  else setFilmTmdbId("");
                  tmdbCombobox.openDropdown();
                }}
                onFocus={() => tmdbCombobox.openDropdown()}
              />
            </Combobox.Target>
            <Combobox.Dropdown>
              <Combobox.Options>
                {tmdbSearchLoading ? (
                  <Combobox.Empty>
                    <Text size="sm" className="muted">
                      Searching TMDB…
                    </Text>
                  </Combobox.Empty>
                ) : tmdbSearchResults.length === 0 ? (
                  <Combobox.Empty>
                    <Text size="sm" className="muted">
                      No TMDB matches
                    </Text>
                  </Combobox.Empty>
                ) : (
                  tmdbSearchResults.map((r) => (
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
                          <Text
                            size="sm"
                            fw="var(--fo-font-weight-semibold)"
                            lineClamp={1}
                          >
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
          {filmTmdbId ? (
            <Text className="muted" size="xs">
              Selected TMDB id: {filmTmdbId}
            </Text>
          ) : null}
          {film?.tmdb_id ? (
            <ActionIcon
              variant="subtle"
              aria-label="Remove TMDB link"
              onClick={() =>
                void (async () => {
                  const r = await onLinkFilm(filmId, null);
                  if (r.ok) {
                    notify({
                      id: "admin.nominees.film.unlink.success",
                      severity: "success",
                      trigger_type: "user_action",
                      scope: "local",
                      durability: "ephemeral",
                      requires_decision: false,
                      title: "Film unlinked",
                      message: "Removed TMDB link."
                    });
                    setFilmLinkOpen(false);
                    setFilmTmdbId("");
                    setTmdbSearchQuery("");
                    setTmdbSearchResults([]);
                    onAfterLinkChange();
                  } else {
                    notify({
                      id: "admin.nominees.film.unlink.error",
                      severity: "error",
                      trigger_type: "user_action",
                      scope: "local",
                      durability: "ephemeral",
                      requires_decision: false,
                      title: "Could not unlink film",
                      message: r.error
                    });
                  }
                })()
              }
            >
              <Text component="span" className="gicon" aria-hidden="true">
                link_off
              </Text>
            </ActionIcon>
          ) : null}
          <Button
            type="button"
            onClick={() =>
              void (async () => {
                const nextTmdbId = filmTmdbId.trim() ? Number(filmTmdbId.trim()) : null;
                const r = await onLinkFilm(filmId, nextTmdbId);
                if (r.ok) {
                  notify({
                    id: "admin.nominees.film.link.success",
                    severity: "success",
                    trigger_type: "user_action",
                    scope: "local",
                    durability: "ephemeral",
                    requires_decision: false,
                    title: nextTmdbId ? "Film linked" : "Film unlinked",
                    message: nextTmdbId
                      ? r.hydrated
                        ? "Hydrated details from TMDB."
                        : "Linked."
                      : "Unlinked."
                  });
                  setFilmLinkOpen(false);
                  setFilmTmdbId("");
                  setTmdbSearchQuery("");
                  setTmdbSearchResults([]);
                  onAfterLinkChange();
                  return;
                }

                if (
                  nextTmdbId &&
                  r.errorCode === "TMDB_ID_ALREADY_LINKED" &&
                  r.errorDetails &&
                  typeof r.errorDetails.linked_film_id === "number"
                ) {
                  setFilmLinkConflict({
                    tmdbId: nextTmdbId,
                    linkedFilmId: r.errorDetails.linked_film_id,
                    linkedFilmTitle:
                      typeof r.errorDetails.linked_film_title === "string"
                        ? r.errorDetails.linked_film_title
                        : null
                  });
                  return;
                }

                notify({
                  id: "admin.nominees.film.link.error",
                  severity: "error",
                  trigger_type: "user_action",
                  scope: "local",
                  durability: "ephemeral",
                  requires_decision: false,
                  title: nextTmdbId ? "Could not link film" : "Could not unlink film",
                  message: r.error
                });
              })()
            }
          >
            Save
          </Button>
        </Group>
      ) : null}

      <NominationFilmLinkConflictModal
        opened={Boolean(filmId) && Boolean(filmLinkConflict)}
        onClose={() => setFilmLinkConflict(null)}
        filmId={filmId}
        conflict={filmLinkConflict}
        onLinkFilm={onLinkFilm}
        onClear={() => setFilmLinkConflict(null)}
        onSuccess={() => {
          setFilmLinkConflict(null);
          setFilmLinkOpen(false);
          setFilmTmdbId("");
          onAfterLinkChange();
        }}
      />
    </Box>
  );
}
