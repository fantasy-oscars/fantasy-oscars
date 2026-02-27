import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Combobox,
  Divider,
  Group,
  Image,
  InputBase,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
  Title,
  useCombobox
} from "@ui";
import { useEffect, useMemo, useState } from "react";
import { StandardCard } from "@/primitives/cards/StandardCard";
import { notify } from "@/notifications";
import { normalizeFilmTitleForTmdbQuery } from "@/lib/films";
import type {
  AdminFilmRow,
  ConsolidatedFilmRow
} from "@/orchestration/admin/filmsIndex/orchestration";
import "@/primitives/baseline.css";

type LinkEditFilm = {
  id: number;
  title: string;
  tmdb_id: number | null;
};

type MergeResult = {
  ok: boolean;
  errorCode?: string;
  errorDetails?: Record<string, unknown>;
};

type TmdbFilmSearchResult = {
  tmdb_id: number;
  title: string;
  original_title: string | null;
  release_year: number | null;
  poster_url: string | null;
  director: string | null;
  overview: string | null;
  linked_film_id: number | null;
  linked_film_title: string | null;
};

type ConsolidatedGroup = {
  normTitle: string;
  films: AdminFilmRow[];
};

type FilmDisplayRow =
  | { type: "film"; film: AdminFilmRow }
  | { type: "group"; group: ConsolidatedGroup; representative: AdminFilmRow };

export function AdminFilmsIndexScreen(props: {
  query: string;
  setQuery: (v: string) => void;
  year: string;
  setYear: (v: string) => void;
  linked: "all" | "linked" | "unlinked";
  setLinked: (v: "all" | "linked" | "unlinked") => void;
  nominated: "all" | "nominated" | "not_nominated";
  setNominated: (v: "all" | "nominated" | "not_nominated") => void;
  loading: boolean;
  status: { ok: true } | { ok: false; message: string } | null;
  films: AdminFilmRow[];
  years: number[];
  page: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;
  linkWorkingFilmId: number | null;
  onReload: () => void;
  onSaveTmdbId: (filmId: number, tmdbId: number | null) => Promise<{ ok: boolean }>;
  onSearchTmdb: (
    q: string
  ) => Promise<
    { ok: true; results: TmdbFilmSearchResult[] } | { ok: false; error: string }
  >;
  onLoadConsolidated: (
    canonicalId: number,
    page: number,
    pageSize: number
  ) => Promise<
    | {
        ok: true;
        films: ConsolidatedFilmRow[];
        total: number;
        page: number;
        pageSize: number;
      }
    | { ok: false; error: string }
  >;
  onDecoupleConsolidated: (
    canonicalId: number,
    filmId: number
  ) => Promise<{ ok: boolean }>;
  onMergeSelected: (films: AdminFilmRow[]) => Promise<MergeResult>;
}) {
  const tmdbCombobox = useCombobox({
    onDropdownClose: () => tmdbCombobox.resetSelectedOption()
  });
  const [editingFilm, setEditingFilm] = useState<LinkEditFilm | null>(null);
  const [tmdbInput, setTmdbInput] = useState("");
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState("");
  const [tmdbSearchLoading, setTmdbSearchLoading] = useState(false);
  const [tmdbSearchResults, setTmdbSearchResults] = useState<TmdbFilmSearchResult[]>([]);
  const [decoupledFilmIds, setDecoupledFilmIds] = useState<Record<number, true>>({});
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [groupPage, setGroupPage] = useState(1);
  const [selectedFilmById, setSelectedFilmById] = useState<Record<number, AdminFilmRow>>(
    {}
  );
  const [mergingSelected, setMergingSelected] = useState(false);
  const [mergeConflict, setMergeConflict] = useState<{
    selectedFilms: AdminFilmRow[];
    linkedFilms: AdminFilmRow[];
    keepLinkedId: string;
  } | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);

  const [consolidatedModalFilm, setConsolidatedModalFilm] = useState<AdminFilmRow | null>(
    null
  );
  const [consolidatedLoading, setConsolidatedLoading] = useState(false);
  const [consolidatedRows, setConsolidatedRows] = useState<ConsolidatedFilmRow[]>([]);
  const [consolidatedPage, setConsolidatedPage] = useState(1);
  const [consolidatedPageSize, setConsolidatedPageSize] = useState(8);
  const [consolidatedTotal, setConsolidatedTotal] = useState(0);
  const [decouplingFilmId, setDecouplingFilmId] = useState<number | null>(null);

  const activeFilters = useMemo(() => {
    let count = 0;
    if (props.year !== "all") count += 1;
    if (props.linked !== "all") count += 1;
    if (props.nominated !== "all") count += 1;
    return count;
  }, [props.linked, props.nominated, props.year]);

  const yearOptions = useMemo(
    () => [
      { value: "all", label: "All years" },
      ...props.years.map((y) => ({ value: String(y), label: String(y) }))
    ],
    [props.years]
  );

  const groupsByNormTitle = useMemo(() => {
    const grouped = new Map<string, AdminFilmRow[]>();
    for (const film of props.films) {
      const key = film.norm_title || String(film.id);
      const existing = grouped.get(key);
      if (existing) existing.push(film);
      else grouped.set(key, [film]);
    }
    return grouped;
  }, [props.films]);

  const displayRows = useMemo<FilmDisplayRow[]>(() => {
    const rows: FilmDisplayRow[] = [];
    for (const films of groupsByNormTitle.values()) {
      const decoupled = films.filter((f) => decoupledFilmIds[f.id]);
      const coupled = films.filter((f) => !decoupledFilmIds[f.id]);

      for (const film of decoupled) rows.push({ type: "film", film });
      if (coupled.length === 1) {
        rows.push({ type: "film", film: coupled[0] });
        continue;
      }
      if (coupled.length > 1) {
        const representative =
          coupled.find((f) => Boolean(f.tmdb_id)) ??
          coupled.find((f) => f.is_nominated) ??
          coupled[0];
        rows.push({
          type: "group",
          group: {
            normTitle: coupled[0]?.norm_title ?? String(coupled[0]?.id ?? ""),
            films: coupled
          },
          representative
        });
      }
    }
    return rows;
  }, [decoupledFilmIds, groupsByNormTitle]);

  const openGroup = useMemo<ConsolidatedGroup | null>(() => {
    if (!openGroupKey) return null;
    const row = displayRows.find(
      (entry): entry is Extract<FilmDisplayRow, { type: "group" }> =>
        entry.type === "group" && entry.group.normTitle === openGroupKey
    );
    return row?.group ?? null;
  }, [displayRows, openGroupKey]);

  const GROUP_PAGE_SIZE = 8;
  const groupPageCount = Math.max(
    1,
    Math.ceil((openGroup?.films.length ?? 0) / GROUP_PAGE_SIZE)
  );
  const clampedGroupPage = Math.min(Math.max(groupPage, 1), groupPageCount);
  const pagedGroupFilms = useMemo<AdminFilmRow[]>(() => {
    if (!openGroup) return [];
    const start = (clampedGroupPage - 1) * GROUP_PAGE_SIZE;
    return openGroup.films.slice(start, start + GROUP_PAGE_SIZE);
  }, [clampedGroupPage, openGroup]);

  const selectedFilms = useMemo(
    () =>
      Object.values(selectedFilmById).sort((a, b) =>
        `${a.title}${a.release_year ?? ""}`.localeCompare(
          `${b.title}${b.release_year ?? ""}`
        )
      ),
    [selectedFilmById]
  );

  const totalPages = Math.max(
    1,
    Math.ceil((props.total || 0) / Math.max(props.pageSize, 1))
  );

  const isRowChecked = (row: FilmDisplayRow) => {
    const film = row.type === "film" ? row.film : row.representative;
    return row.type === "group"
      ? row.group.films.every((groupFilm) => Boolean(selectedFilmById[groupFilm.id]))
      : Boolean(selectedFilmById[film.id]);
  };

  const isRowIndeterminate = (row: FilmDisplayRow) =>
    row.type === "group"
      ? row.group.films.some((groupFilm) => Boolean(selectedFilmById[groupFilm.id])) &&
        !row.group.films.every((groupFilm) => Boolean(selectedFilmById[groupFilm.id]))
      : false;

  const toggleRowSelection = (row: FilmDisplayRow, checked: boolean) => {
    const film = row.type === "film" ? row.film : row.representative;
    setSelectedFilmById((prev) => {
      const next = { ...prev };
      if (row.type === "group") {
        for (const groupFilm of row.group.films) {
          if (checked) next[groupFilm.id] = groupFilm;
          else delete next[groupFilm.id];
        }
        return next;
      }
      if (checked) next[film.id] = film;
      else delete next[film.id];
      return next;
    });
  };

  const selectedDisplayRows = useMemo(
    () => displayRows.filter((row) => isRowChecked(row) || isRowIndeterminate(row)),
    [displayRows, selectedFilmById]
  );

  const loadConsolidatedModal = (canonicalFilm: AdminFilmRow, page = 1) => {
    setConsolidatedModalFilm(canonicalFilm);
    setConsolidatedLoading(true);
    void props
      .onLoadConsolidated(canonicalFilm.id, page, consolidatedPageSize)
      .then((res) => {
        setConsolidatedLoading(false);
        if (!res.ok) return;
        setConsolidatedRows(res.films);
        setConsolidatedTotal(res.total);
        setConsolidatedPage(res.page);
        setConsolidatedPageSize(res.pageSize);
      });
  };

  const consolidatedTotalPages = Math.max(
    1,
    Math.ceil(consolidatedTotal / Math.max(consolidatedPageSize, 1))
  );

  const renderFilmCard = (row: FilmDisplayRow, key: string) => {
    const film = row.type === "film" ? row.film : row.representative;
    const isGroup = row.type === "group";

    return (
      <StandardCard key={key}>
        <Group justify="space-between" align="center" wrap="wrap">
          <Group align="center" gap="sm" wrap="nowrap" miw="var(--fo-space-0)">
            <Checkbox
              aria-label={
                isGroup ? "Select consolidated film records" : "Select film record"
              }
              checked={isRowChecked(row)}
              indeterminate={isRowIndeterminate(row)}
              onChange={(e) => toggleRowSelection(row, e.currentTarget.checked)}
            />
            <Box miw="var(--fo-space-0)">
              <Text fw="var(--fo-font-weight-bold)" className="baseline-textBody">
                {film.title}
                {film.release_year ? ` (${film.release_year})` : ""}
              </Text>
              {isGroup ? (
                <Text className="baseline-textMeta">
                  Consolidates {row.group.films.length} duplicate entries
                </Text>
              ) : null}
            </Box>
          </Group>

          <Group gap="xs" wrap="wrap" justify="flex-end">
            {film.is_nominated ? (
              <Tooltip label="Nominated in at least one ceremony" withArrow>
                <Box component="span" className="baseline-statusPill" aria-hidden="true">
                  <Text component="span" className="gicon" aria-hidden="true">
                    star
                  </Text>
                </Box>
              </Tooltip>
            ) : null}

            {isGroup ? (
              <Tooltip label="View grouped records" withArrow>
                <ActionIcon
                  variant="subtle"
                  aria-label="Open grouped records"
                  onClick={() => {
                    setOpenGroupKey(row.group.normTitle);
                    setGroupPage(1);
                  }}
                >
                  <Text component="span" className="gicon" aria-hidden="true">
                    layers
                  </Text>
                </ActionIcon>
              </Tooltip>
            ) : film.is_consolidated ? (
              <Tooltip label="Manage consolidated records" withArrow>
                <ActionIcon
                  variant="subtle"
                  aria-label="Manage consolidated records"
                  onClick={() => loadConsolidatedModal(film, 1)}
                >
                  <Text component="span" className="gicon" aria-hidden="true">
                    layers
                  </Text>
                </ActionIcon>
              </Tooltip>
            ) : null}

            <Tooltip
              label={film.tmdb_id ? "Linked to TMDB (edit link)" : "Not linked to TMDB"}
              withArrow
            >
              <ActionIcon
                variant="subtle"
                aria-label={film.tmdb_id ? "Edit TMDB link" : "Link to TMDB"}
                onClick={() => {
                  setEditingFilm({
                    id: film.id,
                    title: film.title,
                    tmdb_id: film.tmdb_id
                  });
                  setTmdbInput(film.tmdb_id ? String(film.tmdb_id) : "");
                  setTmdbSearchQuery(normalizeFilmTitleForTmdbQuery(film.title));
                }}
              >
                <Text
                  component="span"
                  className={film.tmdb_id ? "gicon" : "gicon muted"}
                  aria-hidden="true"
                >
                  {film.tmdb_id ? "link" : "link_off"}
                </Text>
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </StandardCard>
    );
  };

  const tryMergeSelected = (filmsToMerge: AdminFilmRow[]) => {
    if (filmsToMerge.length < 2) return;
    const linkedFilms = filmsToMerge.filter(
      (film) => Number.isInteger(film.tmdb_id) && Number(film.tmdb_id) > 0
    );
    if (linkedFilms.length > 1) {
      setMergeConflict({
        selectedFilms: filmsToMerge,
        linkedFilms,
        keepLinkedId: String(linkedFilms[0]?.id ?? "")
      });
      return;
    }
    setMergingSelected(true);
    void props.onMergeSelected(filmsToMerge).then((res) => {
      setMergingSelected(false);
      if (!res.ok) {
        if (
          res.errorCode === "FILM_MERGE_LINK_CONFLICT" &&
          Array.isArray(res.errorDetails?.linked_films)
        ) {
          const linkedById = new Map(
            filmsToMerge
              .filter(
                (film) => Number.isInteger(film.tmdb_id) && Number(film.tmdb_id) > 0
              )
              .map((film) => [film.id, film] as const)
          );
          const linkedFilmsFromError = (
            res.errorDetails?.linked_films as Array<{ id?: unknown }>
          )
            .map((f) => linkedById.get(Number(f.id)))
            .filter((f): f is AdminFilmRow => Boolean(f));
          const linkedFilmsResolved =
            linkedFilmsFromError.length > 1
              ? linkedFilmsFromError
              : filmsToMerge.filter(
                  (film) => Number.isInteger(film.tmdb_id) && Number(film.tmdb_id) > 0
                );
          if (linkedFilmsResolved.length > 1) {
            setMergeConflict({
              selectedFilms: filmsToMerge,
              linkedFilms: linkedFilmsResolved,
              keepLinkedId: String(linkedFilmsResolved[0]?.id ?? "")
            });
          }
        }
        return;
      }
      setSelectedFilmById({});
    });
  };

  useEffect(() => {
    if (!editingFilm) {
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
      void props.onSearchTmdb(q).then((res) => {
        if (cancelled) return;
        setTmdbSearchLoading(false);
        if (!res.ok) {
          setTmdbSearchResults([]);
          return;
        }
        setTmdbSearchResults(res.results);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editingFilm, props, tmdbSearchQuery]);

  return (
    <Stack gap="md">
      <Stack gap="var(--fo-space-4)">
        <Title order={2} className="baseline-textHeroTitle">
          Films
        </Title>
        <Text className="baseline-textBody">
          Search and maintain film records, including TMDB links and nomination status.
        </Text>
      </Stack>

      <Group align="flex-end" gap="sm" wrap="wrap">
        <Box className="fo-flexFieldMd">
          <TextInput
            label="Search films"
            placeholder="Film title"
            value={props.query}
            onChange={(e) => props.setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.onReload();
            }}
          />
        </Box>
        <Menu closeOnItemClick={false} withinPortal position="bottom-end">
          <Menu.Target>
            <Button variant="default">
              Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Box p="sm" className="fo-comboboxPanelNarrow">
              <Stack gap="xs">
                <Select
                  label="Year"
                  data={yearOptions}
                  value={props.year}
                  onChange={(v) => props.setYear(v ?? "all")}
                />
                <Select
                  label="TMDB link"
                  data={[
                    { value: "all", label: "All" },
                    { value: "linked", label: "Linked" },
                    { value: "unlinked", label: "Unlinked" }
                  ]}
                  value={props.linked}
                  onChange={(v) =>
                    props.setLinked(
                      v === "linked" || v === "unlinked" || v === "all" ? v : "all"
                    )
                  }
                />
                <Select
                  label="Nomination status"
                  data={[
                    { value: "all", label: "All" },
                    { value: "nominated", label: "Nominated" },
                    { value: "not_nominated", label: "Not nominated" }
                  ]}
                  value={props.nominated}
                  onChange={(v) =>
                    props.setNominated(
                      v === "nominated" || v === "not_nominated" || v === "all"
                        ? v
                        : "all"
                    )
                  }
                />
                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    onClick={() => {
                      props.setYear("all");
                      props.setLinked("all");
                      props.setNominated("all");
                    }}
                  >
                    Clear
                  </Button>
                </Group>
              </Stack>
            </Box>
          </Menu.Dropdown>
        </Menu>
        <Button variant="default" loading={props.loading} onClick={props.onReload}>
          Search
        </Button>
      </Group>

      {props.status && !props.status.ok ? (
        <Text className="baseline-textBody">{props.status.message}</Text>
      ) : null}

      {selectedFilms.length > 0 ? (
        <Stack gap="sm">
          {selectedDisplayRows.map((row) =>
            renderFilmCard(
              row,
              row.type === "group"
                ? `selected-group:${row.group.normTitle}`
                : `selected-film:${row.film.id}`
            )
          )}
          {selectedFilms.length > 1 ? (
            <Group justify="flex-end">
              <Button
                variant="default"
                loading={mergingSelected}
                onClick={() => {
                  if (selectedFilms.length < 2) return;
                  tryMergeSelected(selectedFilms);
                }}
              >
                Merge films
              </Button>
            </Group>
          ) : null}
          <Divider />
        </Stack>
      ) : null}

      {displayRows.length === 0 ? (
        <Text className="baseline-textBody">No films matched your filters.</Text>
      ) : (
        <Stack gap="sm">
          {displayRows.map((row) =>
            renderFilmCard(
              row,
              row.type === "group"
                ? `index-group:${row.group.normTitle}`
                : `index-film:${row.film.id}`
            )
          )}
        </Stack>
      )}

      <Group justify="space-between" align="center" wrap="wrap">
        <Text className="baseline-textMeta">
          Page {props.page} of {totalPages} ({props.total} records)
        </Text>
        <Group gap="xs">
          <Button
            variant="default"
            disabled={props.page <= 1 || props.loading}
            onClick={() => props.setPage(Math.max(1, props.page - 1))}
          >
            Previous
          </Button>
          <Button
            variant="default"
            disabled={props.page >= totalPages || props.loading}
            onClick={() => props.setPage(Math.min(totalPages, props.page + 1))}
          >
            Next
          </Button>
        </Group>
      </Group>

      <Modal
        opened={Boolean(mergeConflict)}
        onClose={() => {
          if (resolvingConflict) return;
          setMergeConflict(null);
        }}
        title="Resolve TMDB link conflict"
        centered
        size="md"
        overlayProps={{ opacity: 0.35, blur: 2 }}
      >
        <Stack gap="sm">
          <Text className="baseline-textBody">
            Multiple selected films are linked to TMDB. Choose one film to remain linked,
            and the others will be unlinked before merge.
          </Text>
          <Select
            label="Keep linked"
            data={(mergeConflict?.linkedFilms ?? []).map((film) => ({
              value: String(film.id),
              label: `${film.title}${film.release_year ? ` (${film.release_year})` : ""}`
            }))}
            value={mergeConflict?.keepLinkedId ?? null}
            onChange={(value) => {
              if (!value) return;
              setMergeConflict((prev) =>
                prev ? { ...prev, keepLinkedId: value } : prev
              );
            }}
          />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              disabled={resolvingConflict}
              onClick={() => setMergeConflict(null)}
            >
              Cancel
            </Button>
            <Button
              loading={resolvingConflict}
              disabled={!mergeConflict?.keepLinkedId}
              onClick={() => {
                if (!mergeConflict?.keepLinkedId) return;
                const keepId = Number(mergeConflict.keepLinkedId);
                const toUnlink = mergeConflict.linkedFilms.filter(
                  (film) => film.id !== keepId
                );
                setResolvingConflict(true);
                void (async () => {
                  for (const film of toUnlink) {
                    const unlink = await props.onSaveTmdbId(film.id, null);
                    if (!unlink.ok) {
                      setResolvingConflict(false);
                      return;
                    }
                  }
                  const nextSelected = mergeConflict.selectedFilms.map((film) =>
                    toUnlink.some((u) => u.id === film.id)
                      ? { ...film, tmdb_id: null }
                      : film
                  );
                  const merged = await props.onMergeSelected(nextSelected);
                  setResolvingConflict(false);
                  if (!merged.ok) return;
                  setSelectedFilmById({});
                  setMergeConflict(null);
                })();
              }}
            >
              Unlink others and merge
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(editingFilm)}
        onClose={() => {
          setEditingFilm(null);
          setTmdbSearchQuery("");
          setTmdbSearchResults([]);
        }}
        title="Link film to TMDB"
        centered
        size="md"
        overlayProps={{ opacity: 0.35, blur: 2 }}
      >
        <Stack gap="sm">
          <Text className="baseline-textBody">
            {editingFilm?.title ?? "Untitled film"}
          </Text>
          <Text className="baseline-textMeta">
            Saving hydrates film metadata from TMDB when available.
          </Text>
          <Combobox
            store={tmdbCombobox}
            withinPortal
            position="bottom-start"
            middlewares={{ flip: true, shift: true }}
            onOptionSubmit={(value) => {
              const picked = tmdbSearchResults.find((r) => String(r.tmdb_id) === value);
              if (!picked) return;
              if (
                picked.linked_film_id &&
                editingFilm &&
                picked.linked_film_id !== editingFilm.id
              ) {
                notify({
                  id: `admin_films_link_search_linked_${picked.tmdb_id}`,
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
              setTmdbInput(String(picked.tmdb_id));
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
                  if (/^[0-9]+$/.test(trimmed)) {
                    setTmdbInput(trimmed);
                  } else {
                    setTmdbInput("");
                  }
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
          {tmdbInput ? (
            <Text className="baseline-textMeta">Selected TMDB id: {tmdbInput}</Text>
          ) : null}
          <Group justify="space-between" align="center">
            <Button
              variant="subtle"
              disabled={
                !editingFilm?.tmdb_id ||
                (editingFilm ? props.linkWorkingFilmId === editingFilm.id : false)
              }
              onClick={() => {
                if (!editingFilm) return;
                void props.onSaveTmdbId(editingFilm.id, null).then((res) => {
                  if (!res.ok) return;
                  setEditingFilm(null);
                  setTmdbInput("");
                  setTmdbSearchQuery("");
                  setTmdbSearchResults([]);
                });
              }}
            >
              Remove link
            </Button>
            <Button
              loading={editingFilm ? props.linkWorkingFilmId === editingFilm.id : false}
              onClick={() => {
                if (!editingFilm) return;
                const trimmed = tmdbInput.trim();
                const tmdbId = trimmed ? Number(trimmed) : null;
                if (tmdbId !== null && (!Number.isInteger(tmdbId) || tmdbId <= 0)) {
                  notify({
                    id: `admin_films_link_validation_${editingFilm.id}`,
                    severity: "error",
                    trigger_type: "user_action",
                    scope: "local",
                    durability: "ephemeral",
                    requires_decision: false,
                    title: "Invalid TMDB id",
                    message: "Provide a positive numeric TMDB id."
                  });
                  return;
                }
                void props.onSaveTmdbId(editingFilm.id, tmdbId).then((res) => {
                  if (!res.ok) return;
                  setEditingFilm(null);
                  setTmdbInput("");
                  setTmdbSearchQuery("");
                  setTmdbSearchResults([]);
                });
              }}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(openGroup)}
        onClose={() => setOpenGroupKey(null)}
        title="Grouped records"
        centered
        size="lg"
        overlayProps={{ opacity: 0.35, blur: 2 }}
      >
        <Stack gap="sm">
          {openGroup ? (
            <>
              <Text className="baseline-textMeta">
                Showing {openGroup.films.length} records in this grouped entry.
              </Text>
              <Stack gap="xs">
                {pagedGroupFilms.map((groupFilm) => (
                  <StandardCard key={`group-film-${groupFilm.id}`}>
                    <Group justify="space-between" align="center" wrap="wrap">
                      <Box miw="var(--fo-space-0)">
                        <Text
                          className="baseline-textBody"
                          fw="var(--fo-font-weight-semibold)"
                        >
                          {groupFilm.title}
                          {groupFilm.release_year ? ` (${groupFilm.release_year})` : ""}
                        </Text>
                      </Box>
                      <Group gap="xs" wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          aria-label="Decouple from grouped entry"
                          onClick={() => {
                            setDecoupledFilmIds((prev) => ({
                              ...prev,
                              [groupFilm.id]: true
                            }));
                          }}
                        >
                          <Text component="span" className="gicon" aria-hidden="true">
                            call_split
                          </Text>
                        </ActionIcon>
                      </Group>
                    </Group>
                  </StandardCard>
                ))}
              </Stack>
              <Group justify="space-between" align="center">
                <Text className="baseline-textMeta">
                  Page {clampedGroupPage} of {groupPageCount}
                </Text>
                <Group gap="xs">
                  <Button
                    variant="default"
                    disabled={clampedGroupPage <= 1}
                    onClick={() => setGroupPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="default"
                    disabled={clampedGroupPage >= groupPageCount}
                    onClick={() => setGroupPage((p) => Math.min(groupPageCount, p + 1))}
                  >
                    Next
                  </Button>
                </Group>
              </Group>
            </>
          ) : null}
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(consolidatedModalFilm)}
        onClose={() => {
          if (consolidatedLoading || decouplingFilmId) return;
          setConsolidatedModalFilm(null);
          setConsolidatedRows([]);
          setConsolidatedTotal(0);
          setConsolidatedPage(1);
        }}
        title="Manage consolidated records"
        centered
        size="lg"
        overlayProps={{ opacity: 0.35, blur: 2 }}
      >
        <Stack gap="sm">
          <Text className="baseline-textMeta">
            {consolidatedModalFilm
              ? `Consolidated into ${consolidatedModalFilm.title}${consolidatedModalFilm.release_year ? ` (${consolidatedModalFilm.release_year})` : ""}`
              : ""}
          </Text>
          {consolidatedLoading ? (
            <Text className="baseline-textMeta">Loading…</Text>
          ) : consolidatedRows.length === 0 ? (
            <Text className="baseline-textMeta">No consolidated child records.</Text>
          ) : (
            <Stack gap="xs">
              {consolidatedRows.map((groupFilm) => (
                <StandardCard key={`consolidated-child-${groupFilm.id}`}>
                  <Group justify="space-between" align="center" wrap="wrap">
                    <Box miw="var(--fo-space-0)">
                      <Text
                        className="baseline-textBody"
                        fw="var(--fo-font-weight-semibold)"
                      >
                        {groupFilm.title}
                        {groupFilm.release_year ? ` (${groupFilm.release_year})` : ""}
                      </Text>
                    </Box>
                    <Group gap="xs" wrap="nowrap">
                      <ActionIcon
                        variant="subtle"
                        aria-label="Decouple consolidated film"
                        disabled={decouplingFilmId === groupFilm.id}
                        onClick={() => {
                          if (!consolidatedModalFilm) return;
                          setDecouplingFilmId(groupFilm.id);
                          void props
                            .onDecoupleConsolidated(
                              consolidatedModalFilm.id,
                              groupFilm.id
                            )
                            .then((res) => {
                              setDecouplingFilmId(null);
                              if (!res.ok) return;
                              loadConsolidatedModal(
                                consolidatedModalFilm,
                                consolidatedPage
                              );
                            });
                        }}
                      >
                        <Text component="span" className="gicon" aria-hidden="true">
                          call_split
                        </Text>
                      </ActionIcon>
                    </Group>
                  </Group>
                </StandardCard>
              ))}
            </Stack>
          )}
          <Group justify="space-between" align="center">
            <Text className="baseline-textMeta">
              Page {consolidatedPage} of {consolidatedTotalPages} ({consolidatedTotal}{" "}
              records)
            </Text>
            <Group gap="xs">
              <Button
                variant="default"
                disabled={consolidatedPage <= 1 || consolidatedLoading}
                onClick={() => {
                  if (!consolidatedModalFilm) return;
                  loadConsolidatedModal(
                    consolidatedModalFilm,
                    Math.max(1, consolidatedPage - 1)
                  );
                }}
              >
                Previous
              </Button>
              <Button
                variant="default"
                disabled={
                  consolidatedPage >= consolidatedTotalPages || consolidatedLoading
                }
                onClick={() => {
                  if (!consolidatedModalFilm) return;
                  loadConsolidatedModal(
                    consolidatedModalFilm,
                    Math.min(consolidatedTotalPages, consolidatedPage + 1)
                  );
                }}
              >
                Next
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
