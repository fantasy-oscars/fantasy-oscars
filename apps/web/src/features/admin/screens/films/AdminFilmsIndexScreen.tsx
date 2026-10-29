import { Box, Button, Divider, Group, Stack, Text, TextInput, Title } from "@ui";
import { useMemo } from "react";
import {
  computeTotalPages,
  countActiveFilters,
  isRowChecked,
  isRowIndeterminate,
  selectDisplayRowsWithSelection,
  type FilmDisplayRow
} from "@/decisions/films/filmGroups";
import type {
  AdminFilmRow,
  ConsolidatedFilmRow,
  TmdbFilmSearchResult
} from "@/orchestration/admin/filmsIndex/orchestration";
import { ConsolidatedRecordsModal } from "../../ui/films/ConsolidatedRecordsModal";
import { FilmRecordCard } from "../../ui/films/FilmRecordCard";
import { FilmsFilterMenu } from "../../ui/films/FilmsFilterMenu";
import { GroupedRecordsModal } from "../../ui/films/GroupedRecordsModal";
import { MergeConflictModal } from "../../ui/films/MergeConflictModal";
import { TmdbLinkModal } from "../../ui/films/TmdbLinkModal";
import { useConsolidatedFilms } from "./useConsolidatedFilms";
import { useFilmGroups } from "./useFilmGroups";
import { useFilmMerge } from "./useFilmMerge";
import { useTmdbLinkEditor } from "./useTmdbLinkEditor";
import "@/primitives/baseline.css";

type MergeResult = {
  ok: boolean;
  errorCode?: string;
  errorDetails?: Record<string, unknown>;
};

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
  const tmdbLink = useTmdbLinkEditor({
    onSearchTmdb: props.onSearchTmdb,
    onSaveTmdbId: props.onSaveTmdbId
  });
  const groups = useFilmGroups(props.films);
  const merge = useFilmMerge({
    onMergeSelected: props.onMergeSelected,
    onSaveTmdbId: props.onSaveTmdbId
  });
  const consolidated = useConsolidatedFilms({
    onLoadConsolidated: props.onLoadConsolidated,
    onDecoupleConsolidated: props.onDecoupleConsolidated
  });

  const activeFilters = useMemo(
    () =>
      countActiveFilters({
        year: props.year,
        linked: props.linked,
        nominated: props.nominated
      }),
    [props.linked, props.nominated, props.year]
  );

  const yearOptions = useMemo(
    () => [
      { value: "all", label: "All years" },
      ...props.years.map((y) => ({ value: String(y), label: String(y) }))
    ],
    [props.years]
  );

  const { displayRows } = groups;
  const { selectedFilmById, selectedFilms } = merge;

  const selectedDisplayRows = useMemo(
    () => selectDisplayRowsWithSelection(displayRows, selectedFilmById),
    [displayRows, selectedFilmById]
  );

  const totalPages = computeTotalPages(props.total, props.pageSize);

  const renderFilmCard = (row: FilmDisplayRow<AdminFilmRow>, key: string) => (
    <FilmRecordCard
      key={key}
      row={row}
      checked={isRowChecked(row, selectedFilmById)}
      indeterminate={isRowIndeterminate(row, selectedFilmById)}
      onToggle={(checked) => merge.toggleRow(row, checked)}
      onOpenGroup={groups.openGroupModal}
      onManageConsolidated={(film) => consolidated.load(film, 1)}
      onEditTmdbLink={tmdbLink.openFor}
    />
  );

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
        <FilmsFilterMenu
          activeFilters={activeFilters}
          yearOptions={yearOptions}
          year={props.year}
          setYear={props.setYear}
          linked={props.linked}
          setLinked={props.setLinked}
          nominated={props.nominated}
          setNominated={props.setNominated}
        />
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
                loading={merge.mergingSelected}
                onClick={() => {
                  if (selectedFilms.length < 2) return;
                  merge.tryMergeSelected(selectedFilms);
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

      <MergeConflictModal merge={merge} />

      <TmdbLinkModal
        editor={tmdbLink}
        saving={
          tmdbLink.editingFilm
            ? props.linkWorkingFilmId === tmdbLink.editingFilm.id
            : false
        }
      />

      <GroupedRecordsModal groups={groups} />

      <ConsolidatedRecordsModal consolidated={consolidated} />
    </Stack>
  );
}
